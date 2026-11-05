"use client";

import { usePathname, useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { EmptyState, Input, buttonClasses } from "@/components/ui";
import type { Reports } from "@/modules/treasury";
import { METHOD_LABEL } from "@/modules/treasury/schemas";
import { euro, monthTitle } from "./format";

function Table({ title, head, rows }: { readonly title: string; readonly head: string[]; readonly rows: (string | number)[][] }) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <h2 className="px-5 py-4 text-lg font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState size="sm" title="Rien sur la période" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-sunken text-ink-muted">
                {head.map((h, i) => (
                  <th key={h} className={`px-4 py-2 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r[0])} className="border-t border-line">
                  {r.map((v, i) => (
                    <td key={`${String(r[0])}-${head[i]}`} className={`px-4 py-3 ${i === 0 ? "text-ink" : "text-right tabular-nums"}`}>{typeof v === "number" ? euro(v) : v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Rapports d'une période (spec 076) : par catégorie, par objet, par moyen, par mois. */
export default function ReportsTab({ reports, from, to }: { readonly reports: Reports; readonly from?: string; readonly to?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (f?: string, t?: string) => {
    const params = new URLSearchParams({ onglet: "rapports", ...(f ? { du: f } : {}), ...(t ? { au: t } : {}) });
    router.push(`${pathname}?${params.toString()}`);
  };
  const exportHref = `/api/accounting/tresorerie/export?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Du" type="date" value={from ?? ""} onChange={(e) => go(e.target.value || undefined, to)} />
        <Input label="Au" type="date" value={to ?? ""} onChange={(e) => go(from, e.target.value || undefined)} />
        <a href={exportHref} className={`ml-auto ${buttonClasses("secondary", "md")}`}>
          <Download aria-hidden className="h-4 w-4" /> Exporter
        </a>
      </div>
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink-muted">Entrées</p>
          <p className="text-xl font-semibold tabular-nums text-success">{euro(reports.inflows)}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm text-ink-muted">Sorties</p>
          <p className="text-xl font-semibold tabular-nums text-danger">{euro(reports.outflows)}</p>
        </div>
      </section>
      <Table title="Entrées par catégorie" head={["Catégorie", "Total"]} rows={reports.byCategory.filter((c) => c.direction === "IN").map((c) => [c.name, c.total])} />
      <Table title="Offrandes spéciales par objet" head={["Objet", "Total"]} rows={reports.byPurpose.map((p) => [p.name, p.total])} />
      <Table title="Sorties par catégorie" head={["Catégorie", "Total"]} rows={reports.byCategory.filter((c) => c.direction === "OUT").map((c) => [c.name, c.total])} />
      <Table title="Par moyen" head={["Moyen", "Entrées", "Sorties"]} rows={reports.byMethod.map((m) => [METHOD_LABEL[m.method], m.inflows, m.outflows])} />
      <Table title="Par mois" head={["Mois", "Entrées", "Sorties"]} rows={reports.byMonth.map((m) => [monthTitle(m.month), m.inflows, m.outflows])} />
    </div>
  );
}
