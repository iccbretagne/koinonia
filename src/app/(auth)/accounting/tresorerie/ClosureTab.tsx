"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmModal, Modal, StatusChip, Textarea, useToast } from "@/components/ui";
import type { LedgerResult } from "@/modules/treasury";
import { api, errorText, euro, frDate, monthTitle } from "./format";

export interface ClosureData {
  closures: { month: string; closedAt: string; closedById: string | null }[];
  reopenings: { month: string; reason: string; at: string; by: string }[];
}

/**
 * Clôture mensuelle (spec 076) : le mois précédent, vérifié, se clôture ; ses lignes ne se
 * modifient plus. Un Admin peut rouvrir un mois, avec un motif conservé.
 */
export default function ClosureTab({
  data,
  ledger,
  canReopen,
}: {
  readonly data: ClosureData;
  readonly ledger: LedgerResult;
  readonly canReopen: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const closed = data.closures.some((c) => c.month === month);
  const [confirm, setConfirm] = useState(false);
  const [reopen, setReopen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/accounting/tresorerie/closures", { method: "POST", json: { month } });
      toast.success(`${monthTitle(month)} clôturé`);
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  async function doReopen() {
    if (!reopen) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/accounting/tresorerie/closures/${reopen}`, { method: "DELETE", json: { reason } });
      toast.success(`${monthTitle(reopen)} rouvert`);
      setReopen(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const p = ledger.period;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-center gap-3 px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">{monthTitle(month)}, tous comptes</h2>
            {closed ? <StatusChip tone="success">Clôturé</StatusChip> : <StatusChip tone="warning">Ouvert</StatusChip>}
          </div>
          <div className="grid grid-cols-2 border-t border-line md:grid-cols-4 md:divide-x md:divide-line">
            {[
              ["Ouverture", p.opening],
              ["Entrées", p.inflows],
              ["Sorties", p.outflows],
              ["Clôture", p.closing],
            ].map(([label, value]) => (
              <div key={label as string} className="p-4">
                <p className="text-sm text-ink-muted">{label as string}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{euro(value as number)}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-5 py-3 text-sm text-ink-muted">{ledger.lines.length} ligne{ledger.lines.length > 1 ? "s" : ""} sur le mois.</p>
        </section>
        {ledger.warnings.map((w) => (
          <Alert key={w.accountId} tone="danger" title={`${w.accountName} passe sous zéro le ${frDate(w.date)}`}>
            Vérifiez les saisies avant de clôturer.
          </Alert>
        ))}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>

      <aside className="flex flex-[1_1_300px] flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <p className="text-sm text-ink">
            Une fois clôturé, {monthTitle(month).toLowerCase()} ne peut plus être modifié. Seul un Admin peut le rouvrir, avec un motif.
          </p>
          <Button disabled={closed || busy} onClick={() => setConfirm(true)}>
            {closed ? `${monthTitle(month)} est clôturé` : `Clôturer ${monthTitle(month).toLowerCase()}`}
          </Button>
        </section>
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-2 font-semibold text-ink">Mois clôturés</h2>
          {data.closures.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun mois clôturé.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {data.closures.map((c) => (
                <li key={c.month} className="flex items-center gap-2 py-2">
                  <span className="font-semibold text-ink">{monthTitle(c.month)}</span>
                  <span className="text-ink-subtle">le {frDate(c.closedAt)}</span>
                  {canReopen && (
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setReopen(c.month)}>Rouvrir</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.reopenings.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Réouvertures</h3>
              <ul className="space-y-1 text-sm text-ink-muted">
                {data.reopenings.map((r) => (
                  <li key={`${r.month}-${r.at}`}>
                    {monthTitle(r.month)} rouvert le {frDate(r.at)} par {r.by} · « {r.reason} »
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </aside>

      <ConfirmModal
        open={confirm}
        title={`Clôturer ${monthTitle(month).toLowerCase()} ?`}
        message="Ses lignes ne se modifieront plus et ses soldes seront figés."
        confirmLabel="Clôturer"
        confirmingLabel="Clôture…"
        variant="primary"
        confirming={busy}
        onConfirm={close}
        onCancel={() => setConfirm(false)}
      />
      {reopen && (
        <Modal open onClose={() => setReopen(null)} title={`Rouvrir ${monthTitle(reopen).toLowerCase()}`}>
          <div className="space-y-4 p-1">
            <Textarea label="Motif" required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} hint="Conservé dans l'historique." />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReopen(null)}>Annuler</Button>
              <Button disabled={busy || reason.trim().length < 5} onClick={doReopen}>{busy ? "Réouverture…" : "Rouvrir le mois"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
