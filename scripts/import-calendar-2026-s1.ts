/**
 * Import du calendrier semestriel 2026 S1
 * Usage: npx tsx scripts/import-calendar-2026-s1.ts [--dry-run]
 *
 * - Ignore les événements déjà présents (même date + même titre, insensible à la casse)
 * - --dry-run : affiche ce qui serait créé sans toucher la BDD
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

// Mapping titre → type d'événement
function resolveType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("adp") || t.includes("prière") || t.includes("priere") || t.includes("jeûne") || t.includes("jeune") || t.includes("veillée") || t.includes("veille")) return "PRIERE";
  if (t.includes("discipolat")) return "DISCIPOLAT";
  if (t.includes("formation")) return "FORMATION";
  if (t.includes("culte") || t.includes("parlons la parole") || t.includes("baptême") || t.includes("bapteme")) return "CULTE";
  if (t.includes("camp")) return "CAMP";
  if (t.includes("ejp")) return "EJP";
  if (t.includes("comfrat") || t.includes("com frat")) return "COMFRAT";
  if (t.includes("agapé") || t.includes("agape")) return "AGAPE";
  return "EVENEMENT";
}

// Événements extraits du fichier Excel "Calendrier semestriel 2026.xlsx"
// Filtrés : uniquement à partir d'avril, sans ADP, Cultes ni "Parlons la Parole"
const EVENTS: { date: string; title: string }[] = [
  { date: "2026-04-06", title: "Discipolat" },
  { date: "2026-04-20", title: "Discipolat" },
  { date: "2026-05-02", title: "COM FRAT MHI" },
  { date: "2026-05-09", title: "Grande Moisson Rennes" },
  { date: "2026-05-16", title: "Veillée MFI" },
  { date: "2026-05-23", title: "COMFRAT Conseil Elagi" },
  { date: "2026-05-25", title: "Discipolat" },
  { date: "2026-05-30", title: "EJP RENNES" },
  { date: "2026-05-31", title: "Rencontre Femmes mariées" },
  { date: "2026-06-03", title: "Jeûnes et prières ICC Bretagne" },
  { date: "2026-06-04", title: "Jeûnes et prières ICC Bretagne" },
  { date: "2026-06-05", title: "21 jours de jeûnes et prières" },
  { date: "2026-06-06", title: "Veillée ICC Bretagne" },
  { date: "2026-06-07", title: "Agapé des STAR" },
  { date: "2026-06-08", title: "Discipolat" },
  { date: "2026-06-13", title: "CAMP" },
  { date: "2026-06-14", title: "COM FRAT MHI" },
  { date: "2026-06-21", title: "EJP RENNES" },
  { date: "2026-06-22", title: "Discipolat" },
  { date: "2026-06-27", title: "C'FESTIF" },
];

async function main() {
  // Résoudre l'église ICC Rennes
  const church = await prisma.church.findFirst({ where: { slug: "icc-rennes" }, select: { id: true, name: true } });
  if (!church) throw new Error("Église ICC Rennes introuvable (slug: icc-rennes)");
  console.log(`Église : ${church.name} (${church.id})`);

  // Charger les événements existants dans la période
  const existing = await prisma.event.findMany({
    where: {
      churchId: church.id,
      date: { gte: new Date("2026-04-01"), lte: new Date("2026-06-30T23:59:59") },
    },
    select: { title: true, date: true },
  });

  // Index de déduplication : "YYYY-MM-DD|titre normalisé"
  const existingKeys = new Set(
    existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${e.title.trim().toLowerCase()}`)
  );
  console.log(`Événements existants (avr–juin 2026) : ${existing.length}`);

  const toCreate = EVENTS.filter(
    (e) => !existingKeys.has(`${e.date}|${e.title.trim().toLowerCase()}`)
  );
  const skipped = EVENTS.length - toCreate.length;

  console.log(`À créer : ${toCreate.length}  |  Déjà présents (ignorés) : ${skipped}\n`);

  if (toCreate.length === 0) {
    console.log("Rien à importer.");
    return;
  }

  for (const e of toCreate) {
    const type = resolveType(e.title);
    if (DRY_RUN) {
      console.log(`[DRY-RUN] ${e.date}  ${type.padEnd(12)}  ${e.title}`);
    } else {
      await prisma.event.create({
        data: {
          title: e.title,
          type,
          date: new Date(`${e.date}T00:00:00.000Z`),
          churchId: church.id,
        },
      });
      console.log(`✓ ${e.date}  ${type.padEnd(12)}  ${e.title}`);
    }
  }

  if (!DRY_RUN) console.log(`\nImport terminé : ${toCreate.length} événement(s) créé(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
