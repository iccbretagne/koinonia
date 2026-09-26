import { prisma } from "@/lib/prisma";
import { sendEmail, appendPreferenceFooter, buildGenericNotificationEmail } from "@/lib/email";
import { notificationDomains } from "@/lib/registry";
import { resolveEmailPreference, GLOBAL_DOMAIN } from "@/lib/notification-preferences";
import type { Prisma } from "@/generated/prisma/client";

/** Client Prisma acceptant un contexte transactionnel — miroir de `JobDescriptor.handler` (`@/core/module-registry`). */
type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export interface NotificationEmailContent {
  subject: string;
  html: string;
}

export interface NotificationOptions {
  /**
   * Client transactionnel à utiliser pour l'écriture in-app, quand l'appelant est déjà dans un
   * `prisma.$transaction(...)` (spec 053 — nécessaire au lot 2, où plusieurs sites créent leur
   * notification transactionnellement). Défaut : `prisma`.
   *
   * **Si fourni, l'email n'est jamais envoyé ici** : un envoi SMTP est une I/O externe qui ne
   * doit jamais s'exécuter à l'intérieur d'une transaction ouverte. C'est alors à l'appelant
   * d'invoquer `dispatchUserEmails` lui-même, une fois la transaction validée (même schéma que
   * le fire-and-forget déjà pratiqué en comptabilité).
   */
  tx?: Prisma.TransactionClient;
  /**
   * Contenu de l'email. À défaut, un gabarit générique est construit depuis `title`/`message`/
   * `link` de la notification (spec 053, lot 2) : l'absence de gabarit dédié n'empêche jamais
   * l'email de partir si la préférence de l'utilisateur l'autorise. Ignoré si `tx` est fourni
   * (voir ci-dessus).
   */
  email?: NotificationEmailContent;
}

interface NotificationInput {
  domain: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

async function dispatchIfNoTx(userIds: string[], notification: NotificationInput, options?: NotificationOptions): Promise<void> {
  if (options?.tx) return;
  const email = options?.email ?? buildGenericNotificationEmail(notification);
  await dispatchUserEmails(userIds, notification.domain, email);
}

/** Crée une notification pour un utilisateur — `domain` obligatoire (spec 053). */
export async function createNotification(
  params: { userId: string } & NotificationInput,
  options?: NotificationOptions
): Promise<void> {
  const client: PrismaOrTx = options?.tx ?? prisma;
  const { userId, domain, type, title, message, link } = params;
  await client.notification.create({ data: { userId, domain, type, title, message, link } });
  await dispatchIfNoTx([userId], params, options);
}

/** Notifie plusieurs utilisateurs déjà identifiés par l'appelant (spec 053). */
export async function notifyUsers(
  userIds: string[],
  notification: NotificationInput,
  options?: NotificationOptions
): Promise<void> {
  if (userIds.length === 0) return;
  const client: PrismaOrTx = options?.tx ?? prisma;
  await client.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...notification })),
    skipDuplicates: true,
  });
  await dispatchIfNoTx(userIds, notification, options);
}

/** Notifie tous les utilisateurs ayant un rôle donné dans une église. */
export async function notifyUsersWithRole(
  churchId: string,
  role: string,
  notification: NotificationInput,
  options?: NotificationOptions
): Promise<void> {
  const client: PrismaOrTx = options?.tx ?? prisma;
  const roles = await client.userChurchRole.findMany({
    where: { churchId, role: role as never },
    select: { userId: true },
  });
  if (roles.length === 0) return;
  await client.notification.createMany({
    data: roles.map((r) => ({ userId: r.userId, ...notification })),
    skipDuplicates: true,
  });
  await dispatchIfNoTx(roles.map((r) => r.userId), notification, options);
}

/** Notifie tous les membres d'un département ayant une fonction système donnée. */
export async function notifyDeptMembers(
  churchId: string,
  deptFunction: string,
  notification: NotificationInput,
  options?: NotificationOptions
): Promise<void> {
  const client: PrismaOrTx = options?.tx ?? prisma;
  const members = await client.userChurchRole.findMany({
    where: {
      churchId,
      departments: { some: { department: { function: deptFunction, ministry: { churchId } } } },
    },
    select: { userId: true },
  });
  // Also include users with events:manage (global managers see everything)
  const managers = await client.userChurchRole.findMany({
    where: { churchId, role: { in: ["SUPER_ADMIN", "ADMIN", "SECRETARY"] as never[] } },
    select: { userId: true },
  });
  const userIds = Array.from(new Set([...members, ...managers].map((r) => r.userId)));
  if (userIds.length === 0) return;
  await client.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...notification })),
    skipDuplicates: true,
  });
  await dispatchIfNoTx(userIds, notification, options);
}

/**
 * Envoie l'email d'une notification aux destinataires qui l'autorisent (spec 053) : interrupteur
 * général activé **et** domaine activé (explicitement, ou par défaut si jamais réglé). N'envoie
 * qu'aux comptes ayant une adresse email. Avale et journalise toute erreur SMTP — l'action
 * métier qui a déclenché la notification ne doit jamais en dépendre.
 *
 * Toujours appelée avec le client Prisma par défaut (jamais `tx`) : voir `NotificationOptions.tx`.
 */
export async function dispatchUserEmails(
  userIds: string[],
  domain: string,
  content: NotificationEmailContent
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const descriptor = notificationDomains.find((d) => d.key === domain);
  const defaultEmail = descriptor?.defaultEmail ?? false;
  const domainLabel = descriptor?.label ?? domain;

  const [users, preferenceRows] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    prisma.notificationEmailPreference.findMany({
      where: { userId: { in: userIds }, domain: { in: [GLOBAL_DOMAIN, domain] } },
    }),
  ]);

  const preferencesByUser = new Map<string, { global?: boolean; domain?: boolean }>();
  for (const row of preferenceRows) {
    const entry = preferencesByUser.get(row.userId) ?? {};
    if (row.domain === GLOBAL_DOMAIN) entry.global = row.enabled;
    else entry.domain = row.enabled;
    preferencesByUser.set(row.userId, entry);
  }

  const html = appendPreferenceFooter(content.html, domainLabel);

  const recipients = users.filter((user): user is { id: string; email: string } => {
    if (!user.email) return false;
    const prefs = preferencesByUser.get(user.id) ?? {};
    return resolveEmailPreference({
      globalEnabled: prefs.global ?? true,
      domainPreference: prefs.domain,
      defaultEmail,
    });
  });

  const results = await Promise.allSettled(
    recipients.map((user) => sendEmail({ to: user.email, subject: content.subject, html }))
  );

  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failed++;
      console.error(
        `[notifications] Échec d'envoi d'email (domaine ${domain}, destinataire redacted):`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }

  return { sent: recipients.length - failed, failed };
}
