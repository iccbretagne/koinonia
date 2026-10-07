import { jsPDF } from "jspdf";

// ─── Data interface ───────────────────────────────────────────────────────────

export interface ReportExportData {
  event: {
    title: string;
    date: string; // ISO date string
    type: string;
  };
  notes: string | null;
  decisions: string | null;
  sections: Array<{
    label: string;
    position: number;
    stats: Record<string, number | null> | null;
    notes: string | null;
  }>;
  author?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDateFR(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function statDisplay(value: number | null): string {
  return value === null ? "-" : String(value);
}

function sortedSections(sections: ReportExportData["sections"]) {
  return [...sections].sort((a, b) => a.position - b.position);
}

/** Une statistique : libellé court (WhatsApp), libellé complet (PDF) et valeur. */
type StatItem = { short: string; long: string; value: number | null };

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
function exportedSections(sections: ReportExportData["sections"]) {
  return sortedSections(sections).flatMap((section) => {
    const hasStats = section.stats !== null && Object.keys(section.stats).length > 0;
    const notes = section.notes !== null && section.notes.trim() !== "" ? section.notes : null;
    if (!hasStats && !notes) return [];
    return [{ label: section.label, rows: hasStats ? statRows(section.label, section.stats!) : [], notes }];
  });
}

const filled = (text: string | null): text is string => text !== null && text.trim() !== "";

// ─── WhatsApp export ─────────────────────────────────────────────────────────

export function formatReportWhatsApp(data: ReportExportData): string {
  const lines: string[] = [];

  lines.push(`*Compte rendu — ${data.event.title}*`, formatDateFR(data.event.date));

  for (const section of exportedSections(data.sections)) {
    lines.push("", `*${section.label.toUpperCase()}*`);
    for (const row of section.rows) {
      lines.push(row.map((i) => `${i.short} : ${statDisplay(i.value)}`).join(" | "));
    }
    if (section.notes) lines.push(section.notes);
  }

  if (filled(data.notes)) {
    lines.push("", `*OBSERVATIONS GENERALES*`, data.notes);
  }

  if (filled(data.decisions)) {
    lines.push("", `*DECISIONS / ACTIONS*`, data.decisions);
  }

  return lines.join("\n");
}

// ─── PDF export ───────────────────────────────────────────────────────────────

const ICC_VIOLET = "#5E17EB";
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function generateReportPDF(data: ReportExportData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = MARGIN;

  // ── Utility helpers ──────────────────────────────────────────────────────

  function checkPageBreak(needed = 10): void {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function addSectionTitle(label: string): void {
    checkPageBreak(12);
    y += 4;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    const [r, g, b] = hexToRgb(ICC_VIOLET);
    doc.setTextColor(r, g, b);
    doc.text(label, MARGIN, y);
    y += 6;
    // Underline
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 4;
  }

  function addKeyValue(key: string, value: string): void {
    checkPageBreak(7);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(`${key} :`, MARGIN + 2, y);
    const keyWidth = doc.getTextWidth(`${key} : `);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    const wrapped = doc.splitTextToSize(value, CONTENT_WIDTH - keyWidth - 4) as string[];
    doc.text(wrapped, MARGIN + 2 + keyWidth, y);
    y += wrapped.length * 4 + 2;
  }

  function addNotes(text: string): void {
    checkPageBreak(10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH - 4) as string[];
    checkPageBreak(wrapped.length * 4 + 4);
    doc.text(wrapped, MARGIN + 2, y);
    y += wrapped.length * 4 + 3;
  }

  // ── Document title ───────────────────────────────────────────────────────

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const [vr, vg, vb] = hexToRgb(ICC_VIOLET);
  doc.setTextColor(vr, vg, vb);
  const titleLines = doc.splitTextToSize(
    `Compte rendu — ${data.event.title}`,
    CONTENT_WIDTH
  ) as string[];
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7 + 2;

  // Subtitle: date
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(formatDateFR(data.event.date), MARGIN, y);
  y += 8;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 6;

  // ── Sections ─────────────────────────────────────────────────────────────

  for (const section of exportedSections(data.sections)) {
    addSectionTitle(section.label);
    for (const i of section.rows.flat()) {
      addKeyValue(i.long, statDisplay(i.value));
    }
    if (section.notes) {
      checkPageBreak(8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("Observations :", MARGIN + 2, y);
      y += 4;
      addNotes(section.notes);
    }
  }

  // ── Global notes ─────────────────────────────────────────────────────────

  if (filled(data.notes)) {
    addSectionTitle("Observations générales");
    addNotes(data.notes);
  }

  // ── Decisions ────────────────────────────────────────────────────────────

  if (filled(data.decisions)) {
    addSectionTitle("Décisions / Actions");
    addNotes(data.decisions);
  }

  // ── Footer ───────────────────────────────────────────────────────────────

  const pageCount = doc.getNumberOfPages();
  const generatedDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const footerText = data.author
    ? `Généré le ${generatedDate} par ${data.author}`
    : `Généré le ${generatedDate}`;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 160);
    doc.text(footerText, MARGIN, PAGE_HEIGHT - 10);
    doc.text(`${i} / ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 10, { align: "right" });
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  const dateStr = new Date(data.event.date).toISOString().slice(0, 10);
  const safeTitle = data.event.title.replace(/[/\\?%*:|"<>]/g, "-");
  doc.save(`CR-${safeTitle}-${dateStr}.pdf`);
}

// ─── Color helper ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}
