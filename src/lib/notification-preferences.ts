import { prisma } from "@/lib/prisma";
import { rolePermissions, notificationDomains } from "@/lib/registry";
import type { NotificationDomainDescriptor } from "@/core/module-registry";

/** Clé de domaine réservée à l'interrupteur général « Recevoir des emails de Koinonia ». */
export const GLOBAL_DOMAIN = "*";

export interface ResolveEmailPreferenceInput {
  /** Valeur effective de l'interrupteur général (défaut : activé). */
  globalEnabled: boolean;
  /** Préférence explicite du domaine, si l'utilisateur l'a réglée. `undefined` sinon. */
  domainPreference: boolean | undefined;
  /** Valeur du domaine quand l'utilisateur ne l'a jamais réglé (`NotificationDomainDescriptor.defaultEmail`). */
  defaultEmail: boolean;
}

/**
 * Décide si un email doit partir pour ce domaine (spec 053) — fonction pure, appelée par
 * `dispatchUserEmails` (`@/lib/notifications`) et par `getPreferencesView` ci-dessous.
 */
export function resolveEmailPreference({
  globalEnabled,
  domainPreference,
  defaultEmail,
}: ResolveEmailPreferenceInput): boolean {
  if (!globalEnabled) return false;
  if (domainPreference !== undefined) return domainPreference;
  return defaultEmail;
}

export interface NotificationPreferenceDomainView {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface NotificationPreferencesView {
  emailEnabled: boolean;
  /** Faux si le compte n'a pas d'adresse email — les réglages sont alors sans effet. */
  hasEmail: boolean;
  domains: NotificationPreferenceDomainView[];
}

/**
 * Permissions détenues par l'utilisateur, toutes églises confondues (spec 053 : un seul jeu de
 * réglages par personne, commun à toutes ses églises — voir `spec.md`).
 */
async function getHeldPermissions(userId: string): Promise<Set<string>> {
  const churchRoles = await prisma.userChurchRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const permissions = new Set<string>();
  for (const { role } of churchRoles) {
    for (const permission of rolePermissions[role] ?? []) permissions.add(permission);
  }
  return permissions;
}

/**
 * Un domaine est visible si l'utilisateur détient l'une de ses permissions, ou a déjà reçu une
 * notification de ce domaine (rattachage historique de la migration, ou notification émise
 * depuis) — sans quoi un utilisateur au périmètre restreint mais déjà destinataire perdrait
 * l'accès à son propre réglage. `visibleWith` absent = toujours visible.
 */
function isDomainVisible(
  domain: NotificationDomainDescriptor,
  heldPermissions: Set<string>,
  historyDomains: Set<string>
): boolean {
  if (!domain.visibleWith || domain.visibleWith.length === 0) return true;
  if (domain.visibleWith.some((permission) => heldPermissions.has(permission))) return true;
  return historyDomains.has(domain.key);
}

/** Vue complète des préférences d'un utilisateur, pour `GET /api/notifications/preferences` et la page `/profile/notifications`. */
export async function getPreferencesView(userId: string): Promise<NotificationPreferencesView> {
  const [user, heldPermissions, historyRows, preferenceRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    getHeldPermissions(userId),
    prisma.notification.findMany({
      where: { userId, domain: { not: null } },
      distinct: ["domain"],
      select: { domain: true },
    }),
    prisma.notificationEmailPreference.findMany({ where: { userId } }),
  ]);

  const historyDomains = new Set(
    historyRows.map((row) => row.domain).filter((domain): domain is string => domain !== null)
  );
  const preferenceByDomain = new Map(preferenceRows.map((row) => [row.domain, row.enabled]));
  // Défaut activé : absence de ligne "*" ne doit retirer aucun email (mise en service, spec 053).
  const globalEnabled = preferenceByDomain.get(GLOBAL_DOMAIN) ?? true;

  const domains = notificationDomains
    .filter((domain) => isDomainVisible(domain, heldPermissions, historyDomains))
    .map((domain) => ({
      key: domain.key,
      label: domain.label,
      description: domain.description,
      enabled: resolveEmailPreference({
        globalEnabled,
        domainPreference: preferenceByDomain.get(domain.key),
        defaultEmail: domain.defaultEmail,
      }),
    }));

  return { emailEnabled: globalEnabled, hasEmail: !!user?.email, domains };
}

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  /** Clés déjà validées par l'appelant (visibles pour cet utilisateur) — voir la route API. */
  domains?: Record<string, boolean>;
}

/** Écrit les préférences d'un utilisateur. Les clés de `domains` ne sont pas revalidées ici. */
export async function updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<void> {
  const entries: Array<[string, boolean]> = [];
  if (input.emailEnabled !== undefined) entries.push([GLOBAL_DOMAIN, input.emailEnabled]);
  for (const [domain, enabled] of Object.entries(input.domains ?? {})) entries.push([domain, enabled]);

  if (entries.length === 0) return;

  await prisma.$transaction(
    entries.map(([domain, enabled]) =>
      prisma.notificationEmailPreference.upsert({
        where: { userId_domain: { userId, domain } },
        update: { enabled },
        create: { userId, domain, enabled },
      })
    )
  );
}
