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


type DeptType = "accueil" | "sainte-cene" | "integration" | null;

function normalizeDeptName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDeptType(label: string): DeptType {
  const n = normalizeDeptName(label);
  if (n === "accueil") return "accueil";
  if (n.includes("sainte") && n.includes("cene")) return "sainte-cene";
  if (n === "integration" || n.startsWith("integration")) return "integration";
  return null;
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

  switch (getDeptType(label)) {
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
