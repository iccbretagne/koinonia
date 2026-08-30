/**
 * Composeur du message récapitulatif des offres au format WhatsApp (spec 035).
 *
 * Module **pur, sans aucun import** : il est colocalisé ici (et non dans
 * `@/modules/jobs`) parce que l'index du module réexporte un service qui importe
 * `@/lib/prisma` — l'importer depuis un Client Component embarquerait Prisma dans
 * le bundle navigateur. Même arbitrage que `src/app/(auth)/rooms/calendar.ts`
 * (spec 032), et testable en environnement `node` (vitest ne collecte que les
 * `.test.ts`).
 *
 * `RecapJob` ne déclare volontairement ni `contactEmail` ni `contactUrl` : le
 * message est fait pour être transféré sans contrôle, l'omission des coordonnées
 * de l'auteur est structurelle (spec 035, §Forme du message).
 */

export type RecapJobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

export interface RecapJob {
  id: string;
  title: string;
  type: RecapJobType;
  company: string;
  location: string | null;
  deadline: string | null; // ISO, tel que sérialisé par page.tsx
}

const TYPE_LABELS: Record<RecapJobType, string> = {
  EMPLOI: "Emploi",
  STAGE: "Stage",
  ALTERNANCE: "Alternance",
};

/** En-tête : { nom au pluriel, nom unitaire } selon le filtre actif. */
const HEADER: Record<RecapJobType | "ALL", { plural: string; unit: string }> = {
  ALL: { plural: "Offres d'emploi", unit: "offre" },
  EMPLOI: { plural: "Emplois", unit: "offre" },
  STAGE: { plural: "Stages", unit: "stage" },
  ALTERNANCE: { plural: "Alternances", unit: "alternance" },
};

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function jobBlock(job: RecapJob, origin: string): string {
  // Astérisques du titre retirés : un `*` interne casserait le gras WhatsApp
  // sur tout le reste du message.
  const title = job.title.replace(/\*/g, "");

  const meta = [TYPE_LABELS[job.type], job.company];
  if (job.location) meta.push(job.location);

  const lines = [`*${title}*`, meta.join(" · ")];
  if (job.deadline) lines.push(`À postuler avant le ${frDate(job.deadline)}`);
  lines.push(`${origin}/jobs/${job.id}`);

  return lines.join("\n");
}

/**
 * Compose le message WhatsApp à partir des offres AFFICHÉES (déjà filtrées par
 * l'appelant) : le message reflète l'écran, sans exception cachée.
 */
export function buildWhatsAppRecap(
  jobs: RecapJob[],
  filter: RecapJobType | "ALL",
  origin: string
): string {
  const { plural, unit } = HEADER[filter];
  const s = jobs.length > 1 ? "s" : "";
  const header = `📋 ${plural} — ${jobs.length} ${unit}${s} disponible${s}`;

  const blocks = jobs.map((job) => jobBlock(job, origin));
  const footer = `👉 Toutes les offres : ${origin}/jobs`;

  return [header, ...blocks, footer].join("\n\n");
}
