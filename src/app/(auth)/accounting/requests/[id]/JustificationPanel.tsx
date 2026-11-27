"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Modal, Select, StatusChip, Textarea, buttonClasses, type StatusTone } from "@/components/ui";
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

export function justificationChip(j: Pick<Justification, "status" | "late">): { label: string; tone: StatusTone } {
  if (j.status === "AWAITING") {
    return j.late
      ? { label: "Justificatifs en retard", tone: "danger" }
      : { label: "Justificatifs attendus", tone: "warning" };
  }
  if (j.status === "SUBMITTED") return { label: "Justificatifs à vérifier", tone: "info" };
  if (j.status === "RETURN_DUE") return { label: "Reliquat à rendre", tone: "warning" };
  return { label: "Soldée", tone: "success" };
}

const ACTIONS = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
const LIST_LINK =
  "flex min-h-11 items-center rounded-control px-2 text-[15px] text-ink hover:bg-surface-sunken " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function spentHint(valid: boolean, raw: string, preview: number): string | undefined {
  if (!valid || raw === "") return undefined;
  if (preview > 0) return `Reliquat de ${eur(preview)} à rendre à la comptabilité.`;
  if (preview < 0) return `Dépassement de ${eur(-preview)} : demandez le complément une fois les factures déposées.`;
  return undefined;
}

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
  const noFile = j.attachments.length + newFiles.length === 0;

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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Justificatifs</h2>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[15px] leading-[22px]">
        <dt className="text-ink-muted">Versé</dt>
        <dd className="text-right font-semibold tabular-nums text-ink">{eur(j.releasedAmount)}</dd>
        {j.spentAmount !== null && (
          <>
            <dt className="text-ink-muted">{j.waiverReason ? "Retenu (dispense)" : "Dépensé"}</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{eur(j.spentAmount)}</dd>
          </>
        )}
        {!!j.remainder && (
          <>
            <dt className="text-ink-muted">Reliquat</dt>
            <dd className="text-right font-semibold tabular-nums text-warning">{eur(j.remainder)}</dd>
          </>
        )}
        {!!j.overage && (
          <>
            <dt className="text-ink-muted">Dépassement</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{eur(j.overage)}</dd>
          </>
        )}
        {j.status === "AWAITING" && (
          <>
            <dt className="text-ink-muted">À déposer avant le</dt>
            <dd className={`text-right font-semibold ${j.late ? "text-danger" : "text-ink"}`}>{day(j.dueAt)}</dd>
          </>
        )}
        {j.reminderCount > 0 && j.status !== "SETTLED" && (
          <>
            <dt className="text-ink-muted">Relances</dt>
            <dd className="text-right tabular-nums text-ink">{j.reminderCount}</dd>
          </>
        )}
      </dl>

      {j.period && (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Justification du mois de {month(j.period)} — {j.requests.length} versement{j.requests.length > 1 ? "s" : ""} :
          </p>
          <ul className="-mx-2 flex flex-col">
            {j.requests.map((r) => {
              const label = r.occurrenceNumber ? `Versement n° ${r.occurrenceNumber}` : r.label;
              return (
                <li key={r.id}>
                  {r.id === requestId ? (
                    <span className="flex min-h-11 items-center px-2 text-[15px] font-semibold text-ink" aria-current="page">
                      {label} (cette demande)
                    </span>
                  ) : (
                    <Link href={`/accounting/requests/${r.id}`} className={LIST_LINK}>{label}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {j.status === "AWAITING" && j.rejectionReason && (
        <Alert tone="danger" title="Renvoyé par la comptabilité.">{j.rejectionReason}</Alert>
      )}
      {j.waiverReason && <p className="text-[15px] leading-[22px] text-ink-muted">Dispensé de justificatif : {j.waiverReason}</p>}
      {j.status === "SETTLED" && j.returnedAt && (
        <p className="text-[15px] leading-[22px] text-ink-muted">
          Reliquat de {eur(j.returnedAmount ?? 0)} rendu le {day(j.returnedAt)} — {j.returnAccount ? j.returnAccount.name : "compte commun"}.
        </p>
      )}

      {(j.attachments.length > 0 || canSubmit) && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-[15px] font-semibold leading-[22px] text-ink">Factures</h3>
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
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {j.expenseReport ? (
            <p className="text-[15px] leading-[22px] text-ink-muted">Déposez la facture de cette note de frais ({eur(j.releasedAmount)}).</p>
          ) : (
            <Input
              id={`${uid}-spent`}
              label="Montant total dépensé (€)"
              inputMode="decimal"
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
              placeholder="0,00"
              hint={spentHint(spentValid, spent, preview)}
            />
          )}
          {noFile && (
            <p className="text-[13px] leading-[18px] text-ink-muted">Ajoutez au moins une facture pour déposer les justificatifs.</p>
          )}
          <Button
            type="button"
            className="self-start"
            disabled={busy || !spentValid || (!j.expenseReport && spent === "") || noFile}
            onClick={() => act({ action: "submit", spentAmount: spentValue, attachmentIds: newFiles.map((f) => f.id) })}
          >
            {busy ? "Envoi…" : j.status === "SUBMITTED" ? "Mettre à jour les justificatifs" : "Déposer les justificatifs"}
          </Button>
        </div>
      )}

      {j.isSubmitter && overageLeft > 0 && j.status !== "AWAITING" && (
        <Link href={`/accounting/requests/new?complement=${j.id}`} className={`${buttonClasses("secondary")} self-start`}>
          Demander le complément ({eur(overageLeft)})
        </Link>
      )}
      {j.overages.length > 0 && (
        <ul className="-mx-2 flex flex-col">
          {j.overages.map((o) => (
            <li key={o.id}>
              <Link href={`/accounting/requests/${o.id}`} className={LIST_LINK}>
                Complément : {o.label} — {eur(o.amount)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {j.canManage && j.status !== "SETTLED" && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:flex-wrap">
          {j.status === "SUBMITTED" && (
            <>
              <Button type="button" disabled={busy} onClick={() => act({ action: "accept" })}>
                Accepter les justificatifs
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setModal("reject")}>
                Renvoyer au demandeur
              </Button>
            </>
          )}
          {(j.status === "AWAITING" || j.status === "SUBMITTED") && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setModal("waive")}>
              Dispenser de justificatif
            </Button>
          )}
          {j.status === "RETURN_DUE" && (
            <Button type="button" disabled={busy} onClick={() => setModal("return")}>
              Confirmer la restitution
            </Button>
          )}
        </div>
      )}

      {error && <Alert tone="danger" role="alert">{error}</Alert>}

      <Modal open={modal === "reject"} onClose={() => setModal(null)} title="Renvoyer les justificatifs">
        <div className="flex flex-col gap-4">
          <Textarea id={`${uid}-reason`} label="Motif (envoyé au demandeur)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className={ACTIONS}>
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button type="button" disabled={busy || !reason.trim()} onClick={() => act({ action: "reject", reason })}>
              {busy ? "Envoi…" : "Renvoyer au demandeur"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "waive"} onClose={() => setModal(null)} title="Dispenser de justificatif">
        <div className="flex flex-col gap-4">
          <Textarea id={`${uid}-waive`} label="Motif" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Facture perdue…" />
          <Input
            id={`${uid}-retained`}
            label="Montant retenu comme dépensé (€)"
            inputMode="decimal"
            value={retained}
            onChange={(e) => setRetained(e.target.value)}
            hint={`Versé : ${eur(j.releasedAmount)}. Un montant inférieur laisse un reliquat à rendre.`}
          />
          <div className={ACTIONS}>
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button
              type="button"
              disabled={busy || !reason.trim() || !(Number.parseFloat(retained.replace(",", ".")) >= 0)}
              onClick={() => act({ action: "waive", reason, retainedAmount: Number.parseFloat(retained.replace(",", ".")) })}
            >
              {busy ? "Enregistrement…" : "Dispenser de justificatif"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "return"} onClose={() => setModal(null)} title="Confirmer la restitution">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Reliquat de <strong className="text-ink">{eur(j.remainder ?? 0)}</strong> rendu par le demandeur.
          </p>
          <Input id={`${uid}-rdate`} label="Date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          {treasuryAccounts.length > 0 && (
            <Select
              id={`${uid}-raccount`}
              label="Rendu sur"
              value={returnAccount}
              onChange={(e) => setReturnAccount(e.target.value)}
              options={[{ value: "", label: "Compte commun (virement)" }, ...treasuryAccounts.map((a) => ({ value: a.id, label: a.name }))]}
              hint="Rendu en caisse : l'entrée apparaît dans la trésorerie, sans ressaisie."
            />
          )}
          <div className={ACTIONS}>
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
            <Button
              type="button"
              disabled={busy || !returnDate}
              onClick={() => act({ action: "return", returnedAt: new Date(`${returnDate}T12:00:00`).toISOString(), treasuryAccountId: returnAccount || null })}
            >
              {busy ? "Enregistrement…" : "Confirmer la restitution"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
