import { ENTRY_KIND_LABEL, EXPENSE_CATEGORY_LABEL } from "@/modules/shuttle/schemas";
import type { LedgerLine } from "@/modules/shuttle";

export const euro = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const frDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" });

/** Libellé principal d'une ligne du relevé. */
export function lineTitle(l: LedgerLine): string {
  if (l.kind === "BUDGET_ADVANCE") return "Avance de budget versée";
  if (l.kind === "EXPENSE" && l.category) {
    return l.category === "OTHER" && l.label ? l.label : EXPENSE_CATEGORY_LABEL[l.category];
  }
  return ENTRY_KIND_LABEL[l.kind];
}

/** Date locale au format AAAA-MM-JJ. */
export function isoToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type PeriodPreset = "all" | "month" | "lastMonth" | "3months" | "custom";

/** Bornes d'une période prédéfinie (dates locales). */
export function presetRange(preset: PeriodPreset, now = new Date()): { from?: string; to?: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: isoToday(new Date(y, m, 1)) };
    case "lastMonth":
      return { from: isoToday(new Date(y, m - 1, 1)), to: isoToday(new Date(y, m, 0)) };
    case "3months":
      return { from: isoToday(new Date(y, m - 2, 1)) };
    default:
      return {};
  }
}

/** Période prédéfinie qui correspond à des bornes, sinon `custom`. */
export function presetOf(from?: string, to?: string, now = new Date()): PeriodPreset {
  if (!from && !to) return "all";
  for (const p of ["month", "lastMonth", "3months"] as const) {
    const r = presetRange(p, now);
    if (r.from === from && r.to === to) return p;
  }
  return "custom";
}
