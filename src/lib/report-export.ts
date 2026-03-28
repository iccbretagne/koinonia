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

// ─── WhatsApp export ─────────────────────────────────────────────────────────

export function formatReportWhatsApp(data: ReportExportData): string {
  const lines: string[] = [];

  lines.push(`*Compte rendu — ${data.event.title}*`);
  lines.push(formatDateFR(data.event.date));

  for (const section of sortedSections(data.sections)) {
    const deptType = getDeptType(section.label);
    const hasStats = section.stats !== null && Object.keys(section.stats).length > 0;
    const hasNotes = section.notes !== null && section.notes.trim() !== "";

    if (!hasStats && !hasNotes) continue;

    lines.push("");
    lines.push(`*${section.label.toUpperCase()}*`);

    if (hasStats && deptType === "accueil") {
      const h = section.stats!["hommes"] ?? null;
      const f = section.stats!["femmes"] ?? null;
      const e = section.stats!["enfants"] ?? null;
      const totalAdultes = h !== null && f !== null ? h + f : null;
      const totalGeneral = totalAdultes !== null && e !== null ? totalAdultes + e : null;

      lines.push(
        `Hommes : ${statDisplay(h)} | Femmes : ${statDisplay(f)} | Enfants : ${statDisplay(e)}`
      );
      lines.push(
        `Total adultes : ${statDisplay(totalAdultes)} | Total général : ${statDisplay(totalGeneral)}`
      );
    } else if (hasStats && deptType === "sainte-cene") {
      const used = section.stats!["supportsUtilises"] ?? null;
      const remaining = section.stats!["supportsRestants"] ?? null;

      lines.push(`Supports utilisés : ${statDisplay(used)} | Restants : ${statDisplay(remaining)}`);
    } else if (hasStats && deptType === "integration") {
      const h = section.stats!["hommes"] ?? null;
      const f = section.stats!["femmes"] ?? null;
      const passage = section.stats!["passage"] ?? null;
      const convertis = section.stats!["convertis"] ?? null;
      const voeux = section.stats!["voeux"] ?? null;

      lines.push(`Hommes : ${statDisplay(h)} | Femmes : ${statDisplay(f)}`);
      lines.push(
        `De passage : ${statDisplay(passage)} | Convertis : ${statDisplay(convertis)} | Voeux : ${statDisplay(voeux)}`
      );
    } else if (hasStats) {
      for (const [key, value] of Object.entries(section.stats!)) {
        lines.push(`${key} : ${statDisplay(value)}`);
      }
    }

    if (hasNotes) lines.push(section.notes!);
  }

  if (data.notes && data.notes.trim() !== "") {
    lines.push("");
    lines.push(`*OBSERVATIONS GENERALES*`);
    lines.push(data.notes);
  }

  if (data.decisions && data.decisions.trim() !== "") {
    lines.push("");
    lines.push(`*DECISIONS / ACTIONS*`);
    lines.push(data.decisions);
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

  for (const section of sortedSections(data.sections)) {
    const deptType = getDeptType(section.label);
    const hasStats = section.stats !== null && Object.keys(section.stats).length > 0;
    const hasNotes = section.notes !== null && section.notes.trim() !== "";

    if (!hasStats && !hasNotes) continue;

    addSectionTitle(section.label);

    if (hasStats && deptType === "accueil") {
      const h = section.stats!["hommes"] ?? null;
      const f = section.stats!["femmes"] ?? null;
      const e = section.stats!["enfants"] ?? null;
      const totalAdultes = h !== null && f !== null ? h + f : null;
      const totalGeneral = totalAdultes !== null && e !== null ? totalAdultes + e : null;

      addKeyValue("Hommes", statDisplay(h));
      addKeyValue("Femmes", statDisplay(f));
      addKeyValue("Enfants", statDisplay(e));
      addKeyValue("Total adultes", statDisplay(totalAdultes));
      addKeyValue("Total général", statDisplay(totalGeneral));
    } else if (hasStats && deptType === "sainte-cene") {
      const used = section.stats!["supportsUtilises"] ?? null;
      const remaining = section.stats!["supportsRestants"] ?? null;

      addKeyValue("Supports utilisés", statDisplay(used));
      addKeyValue("Supports restants", statDisplay(remaining));
    } else if (hasStats && deptType === "integration") {
      const h = section.stats!["hommes"] ?? null;
      const f = section.stats!["femmes"] ?? null;
      const passage = section.stats!["passage"] ?? null;
      const convertis = section.stats!["convertis"] ?? null;
      const voeux = section.stats!["voeux"] ?? null;

      addKeyValue("Hommes", statDisplay(h));
      addKeyValue("Femmes", statDisplay(f));
      addKeyValue("De passage", statDisplay(passage));
      addKeyValue("Nouveaux convertis", statDisplay(convertis));
      addKeyValue("Renouvellement de vœux", statDisplay(voeux));
    } else if (hasStats) {
      // Generic stats display
      for (const [key, value] of Object.entries(section.stats!)) {
        addKeyValue(key, statDisplay(value));
      }
    }

    if (hasNotes) {
      checkPageBreak(8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("Observations :", MARGIN + 2, y);
      y += 4;
      addNotes(section.notes!);
    }
  }

  // ── Global notes ─────────────────────────────────────────────────────────

  if (data.notes && data.notes.trim() !== "") {
    addSectionTitle("Observations générales");
    addNotes(data.notes);
  }

  // ── Decisions ────────────────────────────────────────────────────────────

  if (data.decisions && data.decisions.trim() !== "") {
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
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}
