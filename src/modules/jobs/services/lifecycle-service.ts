import { prisma } from "@/lib/prisma";
import { sendEmail, buildJobOfferRenewalEmail } from "@/lib/email";

/**
 * Cycle de vie des offres d'emploi (spec 034).
 *
 * Deux passes, exécutées dans cet ordre par un traitement périodique
 * (`POST /api/cron`) :
 *   1. archivage des offres arrivées à échéance ;
 *   2. relance des auteurs d'offres inactives depuis 60 jours.
 *
 * L'ordre compte : on n'envoie jamais de relance pour une offre qu'on archive
 * dans le même passage.
 *
 * Le module emploi est **transverse** (une offre n'a pas de `churchId`) : le
 * traitement balaie toutes les offres de la plateforme en une passe, sans boucle
 * par église — différence de forme assumée avec les autres tâches de
 * l'orchestrateur.
 */

const RENEWAL_AFTER_DAYS = 60;
const ARCHIVE_AFTER_RENEWAL_DAYS = 14;
const RENEWAL_NOTIF_TYPE = "JOB_OFFER_RENEWAL";

const DAY_MS = 86_400_000;

export interface JobOffersLifecycleResult {
  archived: number;
  renewalsSent: number;
  emailFailures: number;
}

export async function runJobOffersLifecycle(appUrl: string): Promise<JobOffersLifecycleResult> {
  const now = new Date();
  const renewalDeadline = new Date(now.getTime() - RENEWAL_AFTER_DAYS * DAY_MS);
  const archiveDeadline = new Date(now.getTime() - ARCHIVE_AFTER_RENEWAL_DAYS * DAY_MS);

  // ─── Passe 1 : archivage ────────────────────────────────────────────────────
  // Offre publiée dont la relance est restée sans réponse depuis 14 jours, OU
  // dont la date limite de candidature est dépassée (régularisation : elle a
  // déjà disparu de la liste, on ne relance pas son auteur pour une échéance
  // qu'il a lui-même fixée). Aucune notification ni email à l'archivage.
  const { count: archived } = await prisma.jobOffer.updateMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { renewalRequestedAt: { lt: archiveDeadline } },
        { deadline: { lt: now } },
      ],
    },
    data: { status: "ARCHIVED" },
  });

  // ─── Passe 2 : relance ──────────────────────────────────────────────────────
  // Offre publiée, jamais relancée (renewalRequestedAt IS NULL), inactive depuis
  // 60 jours (updatedAt), et dont la date limite n'est pas dépassée.
  const stale = await prisma.jobOffer.findMany({
    where: {
      status: "PUBLISHED",
      renewalRequestedAt: null,
      updatedAt: { lt: renewalDeadline },
      OR: [{ deadline: null }, { deadline: { gte: now } }],
    },
    include: {
      author: { select: { id: true, name: true, displayName: true, email: true } },
    },
  });

  let renewalsSent = 0;
  let emailFailures = 0;
  const archiveDate = new Date(now.getTime() + ARCHIVE_AFTER_RENEWAL_DAYS * DAY_MS);

  for (const offer of stale) {
    // Mémorise la relance AVANT tout envoi : le champ sert de garde anti-doublon,
    // et un échec d'email ne doit pas empêcher l'offre de suivre son cycle.
    await prisma.jobOffer.update({
      where: { id: offer.id },
      data: { renewalRequestedAt: now },
    });
    renewalsSent++;

    const message = `Confirmez que « ${offer.title} » chez ${offer.company} est toujours d'actualité, sans quoi elle sera archivée le ${archiveDate.toLocaleDateString("fr-FR")}.`;

    // Notification in-app : toujours, même sans email exploitable.
    try {
      await prisma.notification.create({
        data: {
          userId: offer.authorId,
          type: RENEWAL_NOTIF_TYPE,
          title: "Votre offre d'emploi est-elle toujours d'actualité ?",
          message,
          link: `/jobs/${offer.id}`,
        },
      });
    } catch (err) {
      console.error("Échec de création de notification de relance d'offre (offre redacted):", err instanceof Error ? err.message : err);
    }

    // Email : best-effort, isolé, sans interrompre la boucle ni le cycle.
    if (process.env.SMTP_HOST && offer.author.email) {
      const { subject, html } = buildJobOfferRenewalEmail({
        authorName: offer.author.displayName ?? offer.author.name ?? null,
        jobTitle: offer.title,
        company: offer.company,
        archiveDate,
        jobUrl: `${appUrl}/jobs/${offer.id}`,
      });
      try {
        await sendEmail({ to: offer.author.email, subject, html });
      } catch (err) {
        emailFailures++;
        console.error("Échec d'envoi d'email de relance d'offre (destinataire redacted):", err instanceof Error ? err.message : err);
      }
    }
  }

  return { archived, renewalsSent, emailFailures };
}
