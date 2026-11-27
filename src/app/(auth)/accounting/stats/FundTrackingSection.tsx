"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DataTable } from "@/components/ui";
import { paths } from "@/lib/paths";

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
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Suivi de l&apos;argent versé</h2>
        <p className="mt-0.5 text-[15px] leading-[22px] text-ink-muted">
          Chaque euro versé sur la période est rangé dans une seule case ; les cases s&apos;additionnent au montant versé.
        </p>
      </div>

      {totals.released === 0 ? (
        <p className="text-[15px] leading-[22px] text-ink-muted">Aucun versement sur la période</p>
      ) : (
        <>
          <p className="text-[15px] leading-[22px] text-ink">
            <strong>Versé {eur(totals.released)}</strong>
            {boxes.map((b, i) => (
              <span key={b.key}>
                {i === 0 ? " = " : " + "}
                {b.label} {eur(totals[b.key])}
              </span>
            ))}
          </p>

          <div className="flex h-3 rounded-full overflow-hidden bg-line" aria-hidden="true">
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
                className={`min-h-11 rounded-control border px-3 py-2.5 text-left transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${open === b.key ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-sunken"}`}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold leading-[18px] text-ink">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${b.dot}`} />
                  {b.label}
                  <span className="font-normal text-ink-muted">· {data.requestIds[b.key].length} demande{data.requestIds[b.key].length > 1 ? "s" : ""}</span>
                </span>
                <span className="mt-0.5 block text-lg font-bold tabular-nums text-ink">{eur(totals[b.key])}</span>
                <span className="block text-[13px] leading-[18px] text-ink-muted">{b.help}</span>
              </button>
            ))}
          </div>

          {open && (
            <ul className="divide-y divide-line rounded-control border border-line">
              {data.requestIds[open].map((id) => (
                <li key={id}>
                  <Link
                    href={paths.accounting.request(id)}
                    className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-[15px] leading-[22px] text-ink transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="min-w-0 truncate">{data.labels[id] ?? "Demande"}</span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[15px] leading-[22px] text-ink-muted">
            Taux de justification :{" "}
            <strong className="text-ink">{globalRate === null ? "–" : `${globalRate} %`}</strong>
            <span className="text-[13px] leading-[18px]"> — justifié ÷ versé, hors Navette et hors « avant le suivi »</span>
          </p>

          {data.byDepartment.length > 0 && (
            <DataTable
              data={data.byDepartment.map((d) => ({ ...d, id: d.name }))}
              columns={[
                { header: "Département", primary: true, accessor: (d) => d.name },
                { header: "Versé", align: "right", accessor: (d) => eur(d.released) },
                { header: "Justifié", align: "right", accessor: (d) => eur(d.justified) },
                { header: "À justifier", align: "right", accessor: (d) => (d.toJustify ? eur(d.toJustify) : "–") },
                { header: "À rendre", align: "right", accessor: (d) => (d.returnDue ? eur(d.returnDue) : "–") },
                { header: "Taux", align: "right", accessor: (d) => (d.rate === null ? "–" : `${d.rate} %`) },
              ]}
            />
          )}
        </>
      )}
    </section>
  );
}
