"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import AttachmentManager, { type AttachmentItem } from "@/app/(auth)/accounting/components/AttachmentManager";

/** Justification telle que renvoyée par `/api/accounting/justifications/[id]` (spec 078). */
export interface Justification {
  id: string;
  status: "AWAITING" | "SUBMITTED" | "RETURN_DUE" | "SETTLED";
  period: string | null;
  releasedAmount: number;
  spentAmount: number | null;
  remainder: number | null;
  overage: number | null;
  dueAt: string;
  late: boolean;
  reminderCount: number;
  submittedAt: string | null;
  rejectionReason: string | null;
  waiverReason: string | null;
  decidedAt: string | null;
  returnedAmount: number | null;
  returnedAt: string | null;
  returnAccount: { id: string; name: string } | null;
  requests: { id: string; label: string; amount: number; occurrenceNumber: number | null }[];
  attachments: AttachmentItem[];
  overages: { id: string; label: string; amount: number; status: string }[];
  isSubmitter: boolean;
  canManage: boolean;
  expenseReport: boolean;
}

interface Props {
  readonly justification: Justification;
  readonly requestId: string;
  readonly treasuryAccounts: readonly { id: string; name: string }[];
}

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const month = (p: string) => new Date(`${p}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

export function justificationChip(j: Pick<Justification, "status" | "late">): { label: string; className: string } {
  if (j.status === "AWAITING") {
    return j.late
      ? { label: "Justificatifs en retard", className: "bg-danger-soft text-danger" }
      : { label: "Justificatifs attendus", className: "bg-warning-soft text-warning" };
  }
  if (j.status === "SUBMITTED") return { label: "Justificatifs à vérifier", className: "bg-info-soft text-info" };
  if (j.status === "RETURN_DUE") return { label: "Reliquat à rendre", className: "bg-warning-soft text-warning" };
  return { label: "Soldée", className: "bg-success-soft text-success" };
}

const inputClass = "w-full border border-control-line rounded-lg px-3 py-2 text-base bg-surface focus:outline-none focus:border-brand";
const primary = "px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const secondary = "px-4 py-2 bg-surface text-ink-muted border border-line text-sm font-medium rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors";

export default function JustificationPanel({ justification: initial, requestId, treasuryAccounts }: Props) {
  const router = useRouter();
  const uid = useId();
  const [j, setJ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<AttachmentItem[]>([]);
  const [spent, setSpent] = useState(initial.spentAmount === null ? "" : String(initial.spentAmount));
  const [modal, setModal] = useState<null | "reject" | "waive" | "return">(null);
  const [reason, setReason] = useState("");
  const [retained, setRetained] = useState(String(initial.releasedAmount));
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnAccount, setReturnAccount] = useState("");

  const chip = justificationChip(j);
  const canSubmit = j.isSubmitter && (j.status === "AWAITING" || j.status === "SUBMITTED");
  const spentValue = j.expenseReport ? j.releasedAmount : Number.parseFloat(spent.replace(",", "."));
  const spentValid = Number.isFinite(spentValue) && spentValue >= 0;
  const preview = spentValid ? Math.round((j.releasedAmount - spentValue) * 100) / 100 : 0;
  const askedOverage = j.overages.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED").reduce((s, o) => s + o.amount, 0);
  const overageLeft = Math.round(((j.overage ?? 0) - askedOverage) * 100) / 100;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/justifications/${j.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur");
        return false;
      }
      setJ(json);
      setNewFiles([]);
      setModal(null);
      setReason("");
      router.refresh();
      return true;
    } catch {
      setError("Erreur réseau");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-ink-muted">Justificatifs</h2>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${chip.className}`}>{chip.label}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-subtle">Versé</dt>
        <dd className="text-ink font-medium text-right">{eur(j.releasedAmount)}</dd>
        {j.spentAmount !== null && (
          <>
            <dt className="text-ink-subtle">{j.waiverReason ? "Retenu (dispense)" : "Dépensé"}</dt>
            <dd className="text-ink font-medium text-right">{eur(j.spentAmount)}</dd>
          </>
        )}
        {!!j.remainder && (
          <>
            <dt className="text-ink-subtle">Reliquat</dt>
            <dd className="text-warning font-semibold text-right">{eur(j.remainder)}</dd>
          </>
        )}
        {!!j.overage && (
          <>
            <dt className="text-ink-subtle">Dépassement</dt>
            <dd className="text-ink font-medium text-right">{eur(j.overage)}</dd>
          </>
        )}
        {j.status === "AWAITING" && (
          <>
            <dt className="text-ink-subtle">À déposer avant le</dt>
            <dd className={`text-right font-medium ${j.late ? "text-danger" : "text-ink"}`}>{day(j.dueAt)}</dd>
          </>
        )}
        {j.reminderCount > 0 && j.status !== "SETTLED" && (
          <>
            <dt className="text-ink-subtle">Relances</dt>
            <dd className="text-ink text-right">{j.reminderCount}</dd>
          </>
        )}
      </dl>

      {j.period && (
        <div className="text-xs text-ink-subtle bg-surface-sunken rounded-lg px-3 py-2">
          Justification du mois de {month(j.period)} — {j.requests.length} versement{j.requests.length > 1 ? "s" : ""} :{" "}
          {j.requests.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              {r.id === requestId ? (
                <strong className="text-ink-muted">{r.occurrenceNumber ? `n° ${r.occurrenceNumber}` : r.label}</strong>
              ) : (
                <Link href={`/accounting/requests/${r.id}`} className="text-brand-text hover:underline">
                  {r.occurrenceNumber ? `n° ${r.occurrenceNumber}` : r.label}
                </Link>
              )}
            </span>
          ))}
        </div>
      )}

      {j.status === "AWAITING" && j.rejectionReason && (
        <div className="bg-danger-soft border border-danger/30 rounded-lg px-3 py-2 text-sm">
          <p className="font-semibold text-danger">Renvoyé par la comptabilité</p>
          <p className="text-ink-muted">{j.rejectionReason}</p>
        </div>
      )}
      {j.waiverReason && <p className="text-sm text-ink-muted">Dispensé de justificatif : {j.waiverReason}</p>}
      {j.status === "SETTLED" && j.returnedAt && (
        <p className="text-sm text-ink-muted">
          Reliquat de {eur(j.returnedAmount ?? 0)} rendu le {day(j.returnedAt)} — {j.returnAccount ? j.returnAccount.name : "compte commun"}.
        </p>
      )}

      {(j.attachments.length > 0 || canSubmit) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-ink-subtle uppercase tracking-wide">Factures</h3>
          {j.attachments.length > 0 && (
            <AttachmentManager
              key={j.attachments.map((a) => a.id).join()}
              attachments={j.attachments}
              canDelete={j.isSubmitter && j.status === "AWAITING"}
              onChange={(list) => setJ((x) => ({ ...x, attachments: list }))}
            />
          )}
          {canSubmit && <AttachmentManager key={`new-${j.attachments.length}`} attachments={newFiles} canUpload canDelete onChange={setNewFiles} />}
        </div>
      )}

      {canSubmit && (
        <div className="space-y-3 border-t border-line pt-3">
          {j.expenseReport ? (
            <p className="text-sm text-ink-muted">Déposez la facture de cette note de frais ({eur(j.releasedAmount)}).</p>
          ) : (
            <div>
              <label htmlFor={`${uid}-spent`} className="block text-sm font-medium text-ink-muted mb-1">
                Montant total dépensé (€)
              </label>
              <input id={`${uid}-spent`} inputMode="decimal" value={spent} onChange={(e) => setSpent(e.target.value)} className={inputClass} placeholder="0,00" />
              {spentValid && spent !== "" && preview > 0 && (
                <p className="text-xs text-warning mt-1">Reliquat de {eur(preview)} à rendre à la comptabilité.</p>
              )}
              {spentValid && spent !== "" && preview < 0 && (
                <p className="text-xs text-info mt-1">Dépassement de {eur(-preview)} : demandez le complément une fois les factures déposées.</p>
              )}
            </div>
          )}
          <button
            className={primary}
            disabled={busy || !spentValid || (!j.expenseReport && spent === "") || j.attachments.length + newFiles.length === 0}
            onClick={() => act({ action: "submit", spentAmount: spentValue, attachmentIds: newFiles.map((f) => f.id) })}
          >
            {busy ? "Envoi…" : j.status === "SUBMITTED" ? "Mettre à jour" : "Déposer les justificatifs"}
          </button>
        </div>
      )}

      {j.isSubmitter && overageLeft > 0 && j.status !== "AWAITING" && (
        <Link href={`/accounting/requests/new?complement=${j.id}`} className={`${secondary} inline-block`}>
          Demander le complément ({eur(overageLeft)})
        </Link>
      )}
      {j.overages.length > 0 && (
        <ul className="text-sm space-y-1">
          {j.overages.map((o) => (
            <li key={o.id}>
              <Link href={`/accounting/requests/${o.id}`} className="text-brand-text hover:underline">
                Complément : {o.label} — {eur(o.amount)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {j.canManage && j.status !== "SETTLED" && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {j.status === "SUBMITTED" && (
            <>
              <button className="px-4 py-2 bg-success text-surface text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50" disabled={busy} onClick={() => act({ action: "accept" })}>
                Accepter
              </button>
              <button className={secondary} disabled={busy} onClick={() => setModal("reject")}>
                Renvoyer
              </button>
            </>
          )}
          {(j.status === "AWAITING" || j.status === "SUBMITTED") && (
            <button className={secondary} disabled={busy} onClick={() => setModal("waive")}>
              Dispenser
            </button>
          )}
          {j.status === "RETURN_DUE" && (
            <button className={primary} disabled={busy} onClick={() => setModal("return")}>
              Confirmer la restitution
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Modal open={modal === "reject"} onClose={() => setModal(null)} title="Renvoyer les justificatifs">
        <div className="space-y-4">
          <label htmlFor={`${uid}-reason`} className="block text-sm font-medium text-ink-muted">Motif (envoyé au demandeur)</label>
          <textarea id={`${uid}-reason`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          <div className="flex justify-end gap-2">
            <button className={secondary} onClick={() => setModal(null)}>Annuler</button>
            <button className={primary} disabled={busy || !reason.trim()} onClick={() => act({ action: "reject", reason })}>Renvoyer</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "waive"} onClose={() => setModal(null)} title="Dispenser de justificatif">
        <div className="space-y-4">
          <div>
            <label htmlFor={`${uid}-waive`} className="block text-sm font-medium text-ink-muted mb-1">Motif</label>
            <textarea id={`${uid}-waive`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Facture perdue…" />
          </div>
          <div>
            <label htmlFor={`${uid}-retained`} className="block text-sm font-medium text-ink-muted mb-1">Montant retenu comme dépensé (€)</label>
            <input id={`${uid}-retained`} inputMode="decimal" value={retained} onChange={(e) => setRetained(e.target.value)} className={inputClass} />
            <p className="text-xs text-ink-subtle mt-1">Versé : {eur(j.releasedAmount)}. Un montant inférieur laisse un reliquat à rendre.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className={secondary} onClick={() => setModal(null)}>Annuler</button>
            <button
              className={primary}
              disabled={busy || !reason.trim() || !(Number.parseFloat(retained.replace(",", ".")) >= 0)}
              onClick={() => act({ action: "waive", reason, retainedAmount: Number.parseFloat(retained.replace(",", ".")) })}
            >
              Dispenser
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "return"} onClose={() => setModal(null)} title="Confirmer la restitution">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Reliquat de <strong>{eur(j.remainder ?? 0)}</strong> rendu par le demandeur.</p>
          <div>
            <label htmlFor={`${uid}-rdate`} className="block text-sm font-medium text-ink-muted mb-1">Date</label>
            <input id={`${uid}-rdate`} type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputClass} />
          </div>
          {treasuryAccounts.length > 0 && (
            <div>
              <label htmlFor={`${uid}-raccount`} className="block text-sm font-medium text-ink-muted mb-1">Rendu sur</label>
              <select id={`${uid}-raccount`} value={returnAccount} onChange={(e) => setReturnAccount(e.target.value)} className={inputClass}>
                <option value="">Compte commun (virement)</option>
                {treasuryAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <p className="text-xs text-ink-subtle mt-1">Rendu en caisse : l&apos;entrée apparaît dans la trésorerie, sans ressaisie.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className={secondary} onClick={() => setModal(null)}>Annuler</button>
            <button
              className={primary}
              disabled={busy || !returnDate}
              onClick={() => act({ action: "return", returnedAt: new Date(`${returnDate}T12:00:00`).toISOString(), treasuryAccountId: returnAccount || null })}
            >
              Confirmer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
