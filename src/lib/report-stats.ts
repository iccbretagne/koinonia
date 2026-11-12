/**
 * Mise en forme des sections d'un compte rendu (statistiques par département), sans dépendance
 * d'affichage : partagée par les exports (WhatsApp, PDF) et l'assistant (spec 081).
 */

export interface ReportSectionData {
  label: string;
  position: number;
  stats: Record<string, number | null> | null;
  notes: string | null;
}

/** Type d'une section de compte rendu, déduit de son libellé : il fixe ses statistiques. */
export type ReportSectionType = "accueil" | "sainte-cene" | "integration" | "navette";

export function normalizeSectionLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function reportSectionType(label: string): ReportSectionType | null {
  const n = normalizeSectionLabel(label);
  if (n === "accueil") return "accueil";
  if (n.includes("sainte") && n.includes("cene")) return "sainte-cene";
  if (n === "integration" || n.startsWith("integration")) return "integration";
  if (n.includes("navette")) return "navette";
  return null;
}

export type ReportStatField = { key: string; label: string };

/**
 * Statistiques saisissables par type de section (écran de saisie et assistant IA, spec 081) ;
 * les autres sections n'ont que des observations. Les totaux se calculent, ils ne se saisissent pas.
 */
export const REPORT_STAT_FIELDS: Record<ReportSectionType, ReportStatField[]> = {
  accueil: [
    { key: "hommes", label: "Hommes" },
    { key: "femmes", label: "Femmes" },
    { key: "enfants", label: "Enfants" },
  ],
  "sainte-cene": [
    { key: "supportsUtilises", label: "Supports utilisés" },
    { key: "supportsRestants", label: "Supports restants" },
  ],
  integration: [
    { key: "hommes", label: "Nouveaux arrivants (H)" },
    { key: "femmes", label: "Nouveaux arrivants (F)" },
    { key: "passage", label: "De passage" },
    { key: "convertis", label: "Nouveaux convertis" },
    { key: "voeux", label: "Renouvellement de vœux" },
  ],
  navette: [
    { key: "hommes", label: "Hommes" },
    { key: "femmes", label: "Femmes" },
    { key: "enfants", label: "Enfants" },
  ],
};

/** Statistiques d'une section d'après son libellé, ou null si elle n'en a pas. */
export function reportStatFields(label: string): ReportStatField[] | null {
  const type = reportSectionType(label);
  return type ? REPORT_STAT_FIELDS[type] : null;
}

export function statDisplay(value: number | null): string {
  return value === null ? "-" : String(value);
}

function sortedSections(sections: readonly ReportSectionData[]) {
  return [...sections].sort((a, b) => a.position - b.position);
}

/** Une statistique : libellé court (WhatsApp), libellé complet (PDF) et valeur. */
export type StatItem = { short: string; long: string; value: number | null };

const sum = (a: number | null, b: number | null) => (a !== null && b !== null ? a + b : null);

/**
 * Statistiques d'une section, groupées par ligne WhatsApp. Accueil, Sainte-Cène et Intégration
 * ont une présentation dédiée ; les autres départements listent leurs clés une par ligne.
 */
function statRows(label: string, stats: Record<string, number | null>): StatItem[][] {
  const stat = (key: string) => stats[key] ?? null;
  const item = (short: string, value: number | null, long = short): StatItem => ({ short, long, value });

  switch (reportSectionType(label)) {
    case "accueil": {
      const totalAdultes = sum(stat("hommes"), stat("femmes"));
      return [
        [item("Hommes", stat("hommes")), item("Femmes", stat("femmes")), item("Enfants", stat("enfants"))],
        [item("Total adultes", totalAdultes), item("Total général", sum(totalAdultes, stat("enfants")))],
      ];
    }
    case "sainte-cene":
      return [[
        item("Supports utilisés", stat("supportsUtilises")),
        item("Restants", stat("supportsRestants"), "Supports restants"),
      ]];
    case "integration":
      return [
        [item("Hommes", stat("hommes")), item("Femmes", stat("femmes"))],
        [
          item("De passage", stat("passage")),
          item("Convertis", stat("convertis"), "Nouveaux convertis"),
          item("Voeux", stat("voeux"), "Renouvellement de vœux"),
        ],
      ];
    default:
      return Object.entries(stats).map(([key, value]) => [item(key, value)]);
  }
}

/** Sections à exporter, dans l'ordre : celles qui n'ont ni statistiques ni notes sont omises. */
export function exportedSections(sections: readonly ReportSectionData[]) {
  return sortedSections(sections).flatMap((section) => {
    const hasStats = section.stats !== null && Object.keys(section.stats).length > 0;
    const notes = section.notes !== null && section.notes.trim() !== "" ? section.notes : null;
    if (!hasStats && !notes) return [];
    return [{ label: section.label, rows: hasStats ? statRows(section.label, section.stats!) : [], notes }];
  });
}

export const filled = (text: string | null): text is string => text !== null && text.trim() !== "";
