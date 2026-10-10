/**
 * Composeur du message récapitulatif des offres au format WhatsApp (spec 035), étendu
 * aux missions freelance (spec 064).
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

export type RecapJobType = "EMPLOI" | "STAGE" | "ALTERNANCE" | "MISSION";

export interface RecapJob {
  id: string;
  title: string;
  type: RecapJobType;
  /** Entreprise d'une offre, domaine d'une mission. */
  company: string;
  location: string | null;
  deadline: string | null; // ISO, tel que sérialisé par page.tsx
}

const TYPE_LABELS: Record<RecapJobType, string> = {
  EMPLOI: "Emploi",
  STAGE: "Stage",
  ALTERNANCE: "Alternance",
  MISSION: "Mission",
};

/** En-tête : { nom au pluriel, nom unitaire } selon la pastille active, « ALL » sinon. */
const HEADER: Record<RecapJobType | "ALL", { plural: string; unit: string }> = {
  ALL: { plural: "Opportunités", unit: "opportunité" },
  EMPLOI: { plural: "Emplois", unit: "offre" },
  STAGE: { plural: "Stages", unit: "stage" },
  ALTERNANCE: { plural: "Alternances", unit: "alternance" },
  MISSION: { plural: "Missions freelance", unit: "mission" },
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
  if (job.deadline && job.type !== "MISSION") lines.push(`À postuler avant le ${frDate(job.deadline)}`);
  lines.push(job.type === "MISSION" ? `${origin}/jobs/freelance/missions/${job.id}` : `${origin}/jobs/${job.id}`);

  return lines.join("\n");
}

/**
 * Compose le message WhatsApp à partir des opportunités AFFICHÉES (déjà filtrées par
 * l'appelant) : le message reflète l'écran, sans exception cachée. L'en-tête nomme le type
 * quand une seule pastille est active (spec 064).
 */
export function buildWhatsAppRecap(
  jobs: RecapJob[],
  activeTypes: readonly RecapJobType[],
  origin: string
): string {
  const { plural, unit } = HEADER[activeTypes.length === 1 ? activeTypes[0] : "ALL"];
  const s = jobs.length > 1 ? "s" : "";
  const header = `📋 ${plural} — ${jobs.length} ${unit}${s} disponible${s}`;

  const blocks = jobs.map((job) => jobBlock(job, origin));
  const footer = `👉 Toutes les offres : ${origin}/jobs`;

  return [header, ...blocks, footer].join("\n\n");
}
