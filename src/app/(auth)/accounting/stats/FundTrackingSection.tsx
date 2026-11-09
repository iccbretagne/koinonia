"use client";

import { useState } from "react";
import Link from "next/link";

/** Cases du suivi de l'argent versé (spec 078), dans l'ordre d'affichage. */
const BOXES = [
  { key: "justified", label: "Justifié", help: "Couvert par des factures acceptées, une pièce ou une dispense.", dot: "bg-success" },
  { key: "returned", label: "Rendu", help: "Reliquat rendu à la comptabilité.", dot: "bg-info" },
  { key: "returnDue", label: "À rendre", help: "Reliquat pas encore rendu.", dot: "bg-warning" },
  { key: "toJustify", label: "À justifier", help: "Factures attendues ou en cours de vérification.", dot: "bg-accent" },
  { key: "shuttle", label: "Navette", help: "Versé à la Navette, justifié par son registre.", dot: "bg-brand" },
  { key: "beforeTracking", label: "Avant le suivi", help: "Versé avant la mise en service des relances.", dot: "bg-control-line" },
] as const;

type BoxKey = (typeof BOXES)[number]["key"];
type Totals = Record<BoxKey | "released", number>;

export interface FundTrackingData {
  totals: Totals;
  byDepartment: (Totals & { name: string; rate: number | null })[];
  requestIds: Record<BoxKey, string[]>;
  labels: Record<string, string>;
}

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

/** Taux de justification : justifié ÷ (versé hors navette et hors période antérieure). */
function rate(t: Totals): number | null {
  const base = t.released - t.shuttle - t.beforeTracking;
  return base > 0.004 ? Math.round((t.justified / base) * 100) : null;
}

export default function FundTrackingSection({ data }: { readonly data: FundTrackingData }) {
  const [open, setOpen] = useState<BoxKey | null>(null);
  const { totals } = data;
  const boxes = BOXES.filter((b) => totals[b.key] > 0);
  const globalRate = rate(totals);

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-muted">Suivi de l&apos;argent versé</h2>
        <p className="text-xs text-ink-subtle mt-0.5">
          Chaque euro versé sur la période est rangé dans une seule case ; les cases s&apos;additionnent au montant versé.
        </p>
      </div>

      {totals.released === 0 ? (
        <p className="text-sm text-ink-subtle">Aucun versement sur la période</p>
      ) : (
        <>
          <p className="text-sm text-ink leading-relaxed">
            <strong>Versé {eur(totals.released)}</strong>
            {boxes.map((b, i) => (
              <span key={b.key}>
                {i === 0 ? " = " : " + "}
                {b.label} {eur(totals[b.key])}
              </span>
            ))}
          </p>

          <div className="flex h-3 rounded-full overflow-hidden bg-surface-sunken" aria-hidden="true">
            {boxes.map((b) => (
              <div key={b.key} className={b.dot} style={{ width: `${(totals[b.key] / totals.released) * 100}%` }} />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {boxes.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setOpen(open === b.key ? null : b.key)}
                aria-expanded={open === b.key}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${open === b.key ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40"}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                  <span className={`w-2.5 h-2.5 rounded-full ${b.dot}`} />
                  {b.label}
                  <span className="text-ink-subtle font-normal">· {data.requestIds[b.key].length} demande{data.requestIds[b.key].length > 1 ? "s" : ""}</span>
                </span>
                <span className="block text-lg font-bold text-ink mt-0.5">{eur(totals[b.key])}</span>
                <span className="block text-xs text-ink-subtle">{b.help}</span>
              </button>
            ))}
          </div>

          {open && (
            <ul className="border border-line rounded-lg divide-y divide-line">
              {data.requestIds[open].map((id) => (
                <li key={id}>
                  <Link href={`/accounting/requests/${id}`} className="block px-3 py-2 text-sm text-brand-text hover:bg-surface-sunken">
                    {data.labels[id] ?? "Demande"}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-sm text-ink-muted">
            Taux de justification :{" "}
            <strong className="text-ink">{globalRate === null ? "–" : `${globalRate} %`}</strong>
            <span className="text-xs text-ink-subtle"> — justifié ÷ versé, hors Navette et hors « avant le suivi »</span>
          </p>

          {data.byDepartment.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Département</th>
                    <th className="py-2 px-3 font-medium text-right">Versé</th>
                    <th className="py-2 px-3 font-medium text-right">Justifié</th>
                    <th className="py-2 px-3 font-medium text-right">À justifier</th>
                    <th className="py-2 px-3 font-medium text-right">À rendre</th>
                    <th className="py-2 pl-3 font-medium text-right">Taux</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.byDepartment.map((d) => (
                    <tr key={d.name}>
                      <td className="py-2 pr-3 text-ink-muted">{d.name}</td>
                      <td className="py-2 px-3 text-right text-ink">{eur(d.released)}</td>
                      <td className="py-2 px-3 text-right text-ink">{eur(d.justified)}</td>
                      <td className="py-2 px-3 text-right text-ink">{d.toJustify ? eur(d.toJustify) : "–"}</td>
                      <td className="py-2 px-3 text-right text-ink">{d.returnDue ? eur(d.returnDue) : "–"}</td>
                      <td className="py-2 pl-3 text-right font-medium text-ink">{d.rate === null ? "–" : `${d.rate} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
