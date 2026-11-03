"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Flag, Paperclip, Plus } from "lucide-react";
import {
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  Input,
  PageHeader,
  Select,
  StatusChip,
  Tabs,
  useToast,
} from "@/components/ui";
import type { LedgerLine, LedgerSummary } from "@/modules/shuttle";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from "@/modules/shuttle/schemas";
import type { ShuttleExpenseCategory } from "@/generated/prisma/enums";
import EntryDetail, { ReimbursementChip } from "./EntryDetail";
import EntryForm, { type EntryFormSeed, type RentalOption } from "./EntryForm";
import { euro, frDate, lineTitle, presetOf, presetRange, type PeriodPreset } from "./format";

export type ShuttleView = "releve" | "repartition" | "cautions" | "locations" | "reglages";

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "all", label: "Depuis le début" },
  { key: "month", label: "Ce mois" },
  { key: "lastMonth", label: "Mois dernier" },
  { key: "3months", label: "3 derniers mois" },
  { key: "custom", label: "Personnalisée" },
];

function Amount({ value, className = "" }: { readonly value: number; readonly className?: string }) {
  return <span className={`tabular-nums ${value < 0 ? "text-danger" : ""} ${className}`}>{euro(value)}</span>;
}

function Bars({ items }: { readonly items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-ink-muted">Rien sur la période.</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-sm">
            <span className="text-ink">{i.label}</span>
            <Amount value={i.value} className="text-ink" />
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-sunken">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Écran du registre de la navette (spec 073) : solde à date, période, relevé avec solde courant,
 * répartitions, cautions et avances, locations et réglages.
 */
export default function ShuttleClient({
  ledger,
  rentals,
  settings,
  manager,
  userId,
  view,
  from,
  to,
  highlightId,
}: {
  readonly ledger: LedgerSummary;
  readonly rentals: RentalOption[];
  readonly settings: { lowBalanceThreshold: number | null } | null;
  readonly manager: boolean;
  readonly userId: string;
  readonly view: ShuttleView;
  readonly from?: string;
  readonly to?: string;
  readonly highlightId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const viewer = { userId, manager };
  const preset = presetOf(from, to);
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [formSeed, setFormSeed] = useState<EntryFormSeed | null>(null);
  const [detailId, setDetailId] = useState<string | null>(highlightId ?? null);
  const [threshold, setThreshold] = useState(settings?.lowBalanceThreshold?.toString().replace(".", ",") ?? "");
  const [rentalForm, setRentalForm] = useState({ vendor: "Super U Location", vehicle: "", startDate: "", endDate: "" });
  const [importCategory, setImportCategory] = useState<Record<string, ShuttleExpenseCategory>>({});
  const [busy, setBusy] = useState(false);

  const detail = useMemo(() => ledger.entries.find((l) => l.id === detailId) ?? null, [ledger.entries, detailId]);

  function hrefWith(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("ligne");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function choosePreset(p: PeriodPreset) {
    if (p === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const r = presetRange(p);
    router.push(hrefWith({ du: r.from, au: r.to }));
  }

  async function json(url: string, init: RequestInit, success: string) {
    setBusy(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Action impossible. Réessayez dans un instant.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { key: "releve", label: "Relevé" },
    { key: "repartition", label: "Répartition" },
    { key: "cautions", label: "Cautions & avances", count: ledger.outstandingDeposits.length + ledger.unlinkedExpenseReports.length || undefined },
    { key: "locations", label: "Locations" },
    ...(manager ? [{ key: "reglages", label: "Réglages" }] : []),
  ].map((t) => ({ href: hrefWith({ vue: t.key === "releve" ? undefined : t.key }), label: t.label, count: t.count, active: view === t.key }));

  const p = ledger.period;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navette"
        description="Suivi du budget de la navette : abondements, dépenses et justificatifs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setFormSeed({ mode: "create", kind: "EXPENSE" })}>
              <Plus aria-hidden="true" className="size-4" /> Déclarer une dépense
            </Button>
            {manager ? (
              <Button variant="secondary" onClick={() => setFormSeed({ mode: "create", kind: "FUNDING" })}>
                Abondement
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setFormSeed({ mode: "create", kind: "DEPOSIT_RETURN" })}>
                Autre entrée
              </Button>
            )}
            {manager && (
              <a
                href={`/api/accounting/navette/export?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-control-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Download aria-hidden="true" className="size-4" /> Exporter
              </a>
            )}
          </div>
        }
      />

      <section aria-label="Solde" className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm text-ink-muted">Solde à date</p>
        <p className={`font-display text-3xl font-bold tabular-nums ${ledger.balanceToDate < 0 ? "text-danger" : "text-ink"}`}>
          {euro(ledger.balanceToDate)}
        </p>
        {!ledger.hasOpeningBalance && manager && (
          <p className="mt-1 text-sm text-ink-muted">
            Solde de départ non saisi.{" "}
            <button type="button" className="font-semibold text-brand-text underline" onClick={() => setFormSeed({ mode: "create", kind: "OPENING_BALANCE" })}>
              Le saisir
            </button>
          </p>
        )}
      </section>

      <section aria-label="Période" className="space-y-3">
        <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
          {PRESETS.map((pr) => (
            <FilterChip key={pr.key} pressed={pr.key === "custom" ? customOpen : !customOpen && preset === pr.key} onClick={() => choosePreset(pr.key)}>
              {pr.label}
            </FilterChip>
          ))}
        </div>
        {customOpen && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              router.push(hrefWith({ du: String(data.get("du") || "") || undefined, au: String(data.get("au") || "") || undefined }));
            }}
          >
            <Input label="Du" type="date" name="du" defaultValue={from} />
            <Input label="Au" type="date" name="au" defaultValue={to} />
            <Button type="submit" variant="secondary">
              Appliquer
            </Button>
          </form>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Solde de début", p.openingBalance],
            ["Entrées", p.inflows],
            ["Sorties", -p.outflows],
            ["Écart", p.net],
            ["Solde de fin", p.closingBalance],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-control bg-surface-sunken px-3 py-2">
              <dt className="text-[13px] text-ink-muted">{label}</dt>
              <dd className="font-semibold text-ink">
                <Amount value={value as number} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Tabs tabs={tabs} ariaLabel="Vues du registre" />

      {view === "releve" && (
        <DataTable<LedgerLine>
          data={[...ledger.entries].reverse()}
          highlightedId={highlightId}
          emptyState={<EmptyState title="Aucune ligne sur cette période" description="Déclarez une dépense ou changez de période." />}
          columns={[
            { header: "Date", accessor: (l) => frDate(l.date) },
            {
              header: "Ligne",
              primary: true,
              accessor: (l) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink">{lineTitle(l)}</span>
                  {l.vendor && <span className="text-ink-muted">· {l.vendor}</span>}
                  {l.hasReceipt && <Paperclip aria-label="Justificatif joint" className="size-3.5 text-ink-muted" />}
                  {l.flagNote && <StatusChip tone="warning" icon={Flag}>Signalée</StatusChip>}
                  {l.source === "accounting" && <StatusChip tone="brand">Comptabilité</StatusChip>}
                  {l.personalAdvance && !l.reimbursement && <StatusChip tone="neutral">Avance perso</StatusChip>}
                  {l.reimbursement && <ReimbursementChip status={l.reimbursement.status} />}
                </span>
              ),
            },
            { header: "Par", accessor: (l) => l.createdBy?.name ?? "—", hideOnMobile: true },
            { header: "Montant", align: "right", accessor: (l) => <Amount value={l.amount} /> },
            { header: "Solde", align: "right", hideOnMobile: true, accessor: (l) => <Amount value={l.runningBalance} /> },
          ]}
          actions={(l) => (
            <Button size="sm" variant="ghost" onClick={() => setDetailId(l.id)}>
              Détail
            </Button>
          )}
        />
      )}

      {view === "repartition" && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold text-ink">Sorties par type</h2>
            <Bars items={ledger.byCategory.map((c) => ({ label: EXPENSE_CATEGORY_LABEL[c.category], value: c.total }))} />
          </section>
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold text-ink">Par mois</h2>
            {ledger.byMonth.length === 0 ? (
              <p className="text-sm text-ink-muted">Rien sur la période.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="py-1 font-medium">Mois</th>
                    <th className="py-1 text-right font-medium">Entrées</th>
                    <th className="py-1 text-right font-medium">Sorties</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.byMonth.map((m) => (
                    <tr key={m.month} className="border-t border-line">
                      <td className="py-1.5 text-ink">
                        {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}
                      </td>
                      <td className="py-1.5 text-right">
                        <Amount value={m.inflows} />
                      </td>
                      <td className="py-1.5 text-right">
                        <Amount value={-m.outflows} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="rounded-card border border-line bg-surface p-4 md:col-span-2">
            <h2 className="mb-3 font-semibold text-ink">Coût par location</h2>
            <Bars items={ledger.byRental.map((r) => ({ label: r.label, value: r.cost }))} />
          </section>
        </div>
      )}

      {view === "cautions" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold text-ink">Cautions en cours</h2>
            {ledger.outstandingDeposits.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune caution en attente de restitution.</p>
            ) : (
              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {ledger.outstandingDeposits.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="text-sm text-ink">
                      {euro(d.amount)} · {d.vendor ?? "—"} · versée le {frDate(d.date)}{" "}
                      <span className={d.ageDays > 14 ? "text-warning" : "text-ink-muted"}>({d.ageDays} j)</span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setDetailId(d.id)}>
                      Gérer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-ink">Avances personnelles de la période</h2>
            {ledger.personalAdvances.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune avance personnelle sur la période.</p>
            ) : (
              <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                {ledger.personalAdvances.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="text-sm text-ink">
                      {lineTitle(l)} · {euro(-l.amount)} · {l.createdBy?.name ?? "—"} · {frDate(l.date)}
                    </span>
                    <span className="flex items-center gap-2">
                      {l.reimbursement ? <ReimbursementChip status={l.reimbursement.status} /> : <StatusChip tone="neutral">Non demandé</StatusChip>}
                      <Button size="sm" variant="ghost" onClick={() => setDetailId(l.id)}>
                        Détail
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {manager && (
            <section>
              <h2 className="mb-1 font-semibold text-ink">Notes de frais hors registre</h2>
              <p className="mb-2 text-sm text-ink-muted">
                Notes de frais du département Navette faites directement dans la comptabilité. Ajoutez-les au registre pour
                qu&apos;aucune dépense n&apos;échappe au suivi.
              </p>
              {ledger.unlinkedExpenseReports.length === 0 ? (
                <p className="text-sm text-ink-muted">Aucune.</p>
              ) : (
                <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                  {ledger.unlinkedExpenseReports.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-ink">
                        {r.label} · {euro(r.amount)} · {r.submittedBy} · {frDate(r.date)}
                        {!r.hasReceipt && <span className="text-ink-muted"> · sans justificatif</span>}
                      </span>
                      <span className="flex items-end gap-2">
                        <Select
                          label="Type"
                          value={importCategory[r.id] ?? "FUEL"}
                          onChange={(e) => setImportCategory((c) => ({ ...c, [r.id]: e.target.value as ShuttleExpenseCategory }))}
                          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
                        />
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            json(
                              `/api/accounting/navette/import/${r.id}`,
                              { method: "POST", body: JSON.stringify({ category: importCategory[r.id] ?? "FUEL" }) },
                              "Ajoutée au registre"
                            )
                          }
                        >
                          Ajouter au registre
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {view === "locations" && (
        <div className="space-y-6">
          <form
            className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-5 sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await json(
                "/api/accounting/navette/rentals",
                {
                  method: "POST",
                  body: JSON.stringify({ ...rentalForm, vehicle: rentalForm.vehicle || null, endDate: rentalForm.endDate || null }),
                },
                "Location créée"
              );
              if (ok) setRentalForm((f) => ({ ...f, vehicle: "", startDate: "", endDate: "" }));
            }}
          >
            <Input label="Loueur" required value={rentalForm.vendor} onChange={(e) => setRentalForm((f) => ({ ...f, vendor: e.target.value }))} />
            <Input label="Véhicule" value={rentalForm.vehicle} onChange={(e) => setRentalForm((f) => ({ ...f, vehicle: e.target.value }))} />
            <Input label="Début" type="date" required value={rentalForm.startDate} onChange={(e) => setRentalForm((f) => ({ ...f, startDate: e.target.value }))} />
            <Input label="Fin" type="date" value={rentalForm.endDate} onChange={(e) => setRentalForm((f) => ({ ...f, endDate: e.target.value }))} />
            <Button type="submit" disabled={busy}>
              Ajouter
            </Button>
          </form>
          {rentals.length === 0 ? (
            <EmptyState title="Aucune location" description="Créez une location pour y rattacher ses dépenses." />
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {rentals.map((r) => {
                const cost = ledger.byRental.find((b) => b.id === r.id)?.cost;
                return (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                    <span className="text-ink">
                      {r.vendor}
                      {r.vehicle ? ` · ${r.vehicle}` : ""} · {frDate(r.startDate)}
                      {r.endDate ? ` → ${frDate(r.endDate)}` : ""}
                    </span>
                    {cost !== undefined && <Amount value={cost} className="text-ink" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {view === "reglages" && manager && (
        <form
          className="max-w-md space-y-3 rounded-card border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = threshold.trim() === "" ? null : Number(threshold.replace(",", "."));
            if (value !== null && (!Number.isFinite(value) || value < 0)) {
              toast.error("Seuil invalide.");
              return;
            }
            void json("/api/accounting/navette/settings", { method: "PUT", body: JSON.stringify({ lowBalanceThreshold: value }) }, "Réglage enregistré");
          }}
        >
          <Input
            label="Seuil d'alerte de solde bas (€)"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            hint="Vide : pas d'alerte. La compta et les responsables de la navette sont prévenus quand le solde passe sous ce seuil."
          />
          <Button type="submit" disabled={busy}>
            Enregistrer
          </Button>
        </form>
      )}

      {formSeed && (
        <EntryForm
          key={formSeed.mode === "edit" ? formSeed.line.id : `${formSeed.kind ?? ""}-${formSeed.returnOf?.id ?? ""}`}
          open
          seed={formSeed}
          onClose={() => setFormSeed(null)}
          manager={manager}
          hasOpeningBalance={ledger.hasOpeningBalance}
          rentals={rentals}
          outstandingDeposits={ledger.outstandingDeposits}
        />
      )}
      <EntryDetail
        key={detail?.id ?? "none"}
        line={detail}
        viewer={viewer}
        onClose={() => setDetailId(null)}
        onEdit={(line) => {
          setDetailId(null);
          setFormSeed({ mode: "edit", line });
        }}
        onReturnDeposit={(line) => {
          setDetailId(null);
          setFormSeed({ mode: "create", returnOf: line });
        }}
      />
    </div>
  );
}
