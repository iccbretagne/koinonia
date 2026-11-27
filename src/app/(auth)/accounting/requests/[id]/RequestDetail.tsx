"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Button, FilterChip, IconButton, Input, Modal, Select, StatusChip, Textarea, buttonClasses, fieldLabelClasses, useToast, type StatusTone } from "@/components/ui";
import { Archive, Check, PencilLine, Plus, Repeat, X, Zap } from "lucide-react";
import AttachmentManager from "@/app/(auth)/accounting/components/AttachmentManager";
import PieceRequestPanel from "./PieceRequestPanel";
import JustificationPanel, { type Justification } from "./JustificationPanel";
import { paths } from "@/lib/paths";

type DateLike = string | Date;

const SECTION_TITLE = "font-display text-[17px] font-semibold leading-6 text-ink";

const TYPE_LABELS: Record<string, string> = {
  EXPENSE_REPORT: "Note de frais",
  BUDGET_ADVANCE: "Avance de budget",
};
const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:  "En attente",
  PROCESSING: "En traitement",
  APPROVED:   "Validée",
  REJECTED:   "Rejetée",
  CANCELLED:  "Annulée",
};
const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:  "warning",
  PROCESSING: "info",
  APPROVED:   "success",
  REJECTED:   "danger",
  CANCELLED:  "neutral",
};
const RECURRENCE_LABELS: Record<string, [string, string]> = { WEEK: ["semaine", "semaines"], MONTH: ["mois", "mois"] };

function recurrenceLabel(every: number, unit: string): string {
  const [one, many] = RECURRENCE_LABELS[unit] ?? [unit, unit];
  return every > 1 ? `${every} ${many}` : one;
}

interface Payment {
  id: string;
  amount: number | string;
  scheduledDate: DateLike;
  releasedAt: DateLike | null;
  releasedAmount: number | string | null;
  releasedBy: { id: string; name: string | null } | null;
  note: string | null;
  /** Compte de trésorerie d'où est partie la tranche (spec 076) ; `null` = compte commun. */
  treasuryAccountId?: string | null;
}

interface Request {
  id: string;
  type: string;
  label: string;
  description: string | null;
  amount: number | string;
  status: string;
  priority: string | null;
  priorityNote: string | null;
  rejectionReason: string | null;
  pieceRequestedAt?: DateLike | null;
  pieceRequestLastAt?: DateLike | null;
  pieceRequestCount?: number;
  pieceRequestNote?: string | null;
  /** Archivée à la main par la compta (spec 089). */
  archivedAt?: DateLike | null;
  createdAt: DateLike;
  processedAt: DateLike | null;
  department: { id: string; name: string; ministry: { name: string } } | null;
  submittedBy: { id: string; name: string | null; email: string | null };
  processedBy: { id: string; name: string | null } | null;
  payments: Payment[];
  attachments: { id: string; filename: string; mimeType: string; size: number; s3Key?: string }[];
  series: { id: string; label: string; recurrenceEvery: number; recurrenceUnit: string; status: string } | null;
  correctionOf: { id: string; label: string; status: string } | null;
  corrections: { id: string; label: string; status: string; createdAt: DateLike }[];
}

interface Props {
  readonly request: Request;
  readonly canManage: boolean;
  readonly isOwn: boolean;
  /** Comptes de trésorerie actifs (spec 076) ; vide si la trésorerie est désactivée ou inaccessible. */
  readonly treasuryAccounts?: readonly { id: string; name: string }[];
  /** Hors de la file (spec 089) : close d'office, ou archivée à la main sans action en attente. */
  readonly archived?: boolean;
  /** Justificatifs après la remise des fonds (spec 078), si la demande en attend. */
  readonly justification?: Justification | null;
  /** Arriéré : versée avant le suivi, la compta peut réclamer les justificatifs (spec 078). */
  readonly claimable?: boolean;
  /** Le demandeur a encore un compte dans l'église (spec 086) : sinon, pas de demande de pièce. */
  readonly submitterActive?: boolean;
  /** Lecture pastorale (spec 092) : aucune action, pièces listées sans ouverture ni téléchargement. */
  readonly readOnly?: boolean;
}

function fmt(d: DateLike | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtAmount(n: number | string) {
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
// ── Workflow steps ───────────────────────────────────────────────────────────
const STEPS = ["SUBMITTED", "PROCESSING", "APPROVED"];
function stepCircleClass(isRejected: boolean, current: boolean, done: boolean): string {
  if (isRejected) return "bg-surface-sunken text-ink-subtle";
  if (current) return "bg-brand text-on-brand";
  if (done) return "bg-brand-soft text-brand-text";
  return "bg-surface-sunken text-ink-subtle";
}
function WorkflowBar({ status }: { readonly status: string }) {
  const isRejected = status === "REJECTED" || status === "CANCELLED";
  return (
    <ol className="flex items-center" aria-label="Étapes de la demande">
      {STEPS.map((s, i) => {
        const done = !isRejected && (STEPS.indexOf(status) >= i || status === s);
        const current = status === s;
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={current ? "step" : undefined}>
            <div className="flex min-w-[72px] flex-col items-center">
              <div className={`flex size-6 items-center justify-center rounded-full text-[13px] font-semibold ${stepCircleClass(isRejected, current, done)}`}>
                {done && !current ? <Check aria-hidden="true" className="size-4" strokeWidth={2} /> : i + 1}
              </div>
              <p className={`mt-1 max-w-[80px] text-center text-[13px] leading-[18px] ${done ? "font-semibold text-ink-muted" : "text-ink-subtle"}`}>
                {STATUS_LABELS[s]}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div aria-hidden="true" className={`mx-1 -mt-5 h-0.5 flex-1 ${done && !current ? "bg-brand" : "bg-line"}`} />
            )}
          </li>
        );
      })}
      {isRejected && (
        <li className="ml-3">
          <StatusChip tone={STATUS_TONES[status]} icon={X}>{STATUS_LABELS[status]}</StatusChip>
        </li>
      )}
    </ol>
  );
}

export default function RequestDetail({ request: initial, canManage, isOwn, treasuryAccounts = [], archived = false, justification = null, claimable = false, submitterActive = true, readOnly = false }: Props) {
  const router = useRouter();
  const uid = useId();
  const [req, setReq] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [processOpen, setProcessOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [releasingPaymentId, setReleasingPaymentId] = useState<string | null>(null);

  // Formulaires modales
  const [priority, setPriority] = useState<"URGENT" | "NORMAL">("NORMAL");
  const [priorityNote, setPriorityNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [paymentLines, setPaymentLines] = useState(() => [{ id: crypto.randomUUID(), amount: String(initial.amount), scheduledDate: "", note: "" }]);
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseAccount, setReleaseAccount] = useState("");

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return false; }

      // After approve the payments were just created — re-fetch the full request
      if (body.action === "approve") {
        const full = await fetch(`/api/accounting/requests/${req.id}`).then((r) => r.json());
        setReq((r) => ({ ...r, ...full }));
      } else {
        setReq((r) => ({ ...r, ...json }));
      }
      router.refresh();
      return true;
    } catch { setError("Erreur réseau"); return false; }
    finally { setLoading(false); }
  }

  async function releasePayment(paymentId: string) {
    const planned = Number(req.payments.find((p) => p.id === paymentId)?.amount ?? 0);
    const released = Number.parseFloat(releaseAmount) || planned;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releasedAt:     new Date(releaseDate).toISOString(),
          releasedAmount: released,
          treasuryAccountId: releaseAccount || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }

      // Re-fetch to get updated payments list (may include a new residual tranche)
      const full = await fetch(`/api/accounting/requests/${req.id}`).then((r) => r.json());
      setReq((r) => ({ ...r, ...full }));
      router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); setReleasingPaymentId(null); }
  }

  async function claim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claimJustification" }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Erreur");
      else router.refresh();
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  const totalPayments = req.payments.reduce((s, p) => s + Number(p.amount), 0);
  const releasedPayments = req.payments
    .filter((p) => p.releasedAt)
    .reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="neutral">{TYPE_LABELS[req.type]}</StatusChip>
              {req.priority === "URGENT" && <StatusChip tone="danger" icon={Zap}>Urgent</StatusChip>}
              {req.series && (
                <StatusChip tone="brand" icon={Repeat}>
                  Récurrente · tous les {recurrenceLabel(req.series.recurrenceEvery, req.series.recurrenceUnit)}
                </StatusChip>
              )}
            </div>
            <h1 className="font-display text-[22px] font-bold leading-7 text-ink [text-wrap:balance] md:text-[28px] md:leading-9">{req.label}</h1>
            {req.department
              ? <p className="text-[15px] leading-[22px] text-ink-muted">{req.department.ministry.name} — {req.department.name}</p>
              : <p className="text-[15px] leading-[22px] text-ink-muted">Personnel / sans département</p>
            }
            <p className="text-[13px] leading-[18px] text-ink-subtle">Par {req.submittedBy.name ?? req.submittedBy.email} · {fmt(req.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <StatusChip tone={STATUS_TONES[req.status] ?? "neutral"}>{STATUS_LABELS[req.status] ?? req.status}</StatusChip>
            <span className="text-lg font-bold tabular-nums text-ink">{fmtAmount(req.amount)}</span>
          </div>
        </div>

        {canManage && ["APPROVED", "REJECTED", "CANCELLED"].includes(req.status) && (
          <ArchiveBar archived={archived} manual={!!req.archivedAt} disabled={loading} onChange={(a) => patch({ action: a ? "archive" : "unarchive" })} />
        )}

        {/* Progression workflow */}
        <div className="border-t border-line pt-3">
          <WorkflowBar status={req.status} />
        </div>

        {req.correctionOf && (
          <Alert
            tone="info"
            title={`Correction de la demande « ${req.correctionOf.label} ».`}
            action={
              <Link href={paths.accounting.request(req.correctionOf.id)} className={buttonClasses("ghost", "sm")}>
                Voir la demande d&apos;origine
              </Link>
            }
          />
        )}
      </div>

      {error && <Alert tone="danger" role="alert">{error}</Alert>}

      {/* Détails */}
      {req.description && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_TITLE}>Description</h2>
          <p className="whitespace-pre-line text-[15px] leading-[22px] text-ink">{req.description}</p>
        </section>
      )}

      <PieceRequestPanel
        requestId={req.id}
        status={req.status}
        requestedAt={req.pieceRequestedAt ?? null}
        lastAt={req.pieceRequestLastAt ?? null}
        count={req.pieceRequestCount ?? 0}
        note={req.pieceRequestNote ?? null}
        canManage={canManage}
        isOwn={isOwn}
        submitterActive={submitterActive}
      />

      {/* Pièces jointes */}
      {(req.attachments.length > 0 || (isOwn && req.status === "SUBMITTED")) && (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE}>
            Pièces jointes
            {req.attachments.length > 0 && <span className="ml-1 font-normal text-ink-subtle">({req.attachments.length})</span>}
          </h2>
          <AttachmentManager
            attachments={req.attachments}
            requestId={req.id}
            canUpload={isOwn && req.status === "SUBMITTED"}
            canDelete={isOwn && req.status === "SUBMITTED"}
            canOpen={!readOnly}
            onChange={(updated) => setReq((r) => ({ ...r, attachments: updated }))}
          />
        </section>
      )}

      {/* Priorité + note compta */}
      {req.status === "PROCESSING" && (req.priority || req.priorityNote) && (
        <Alert tone={req.priority === "URGENT" ? "danger" : "info"} title={req.priority === "URGENT" ? "Traitement urgent." : "En cours de traitement."}>
          {req.priorityNote}
        </Alert>
      )}

      {/* Motif de rejet */}
      {req.status === "REJECTED" && req.rejectionReason && (
        <Alert
          tone="danger"
          title="Demande rejetée."
          action={
            isOwn ? (
              <Link
                href={paths.accounting.newRequest({ correctionOf: req.id })}
                className={buttonClasses("secondary", "sm")}
              >
                <PencilLine aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Corriger la demande
              </Link>
            ) : undefined
          }
        >
          {req.rejectionReason}
        </Alert>
      )}

      {/* Plan de paiement */}
      {req.status === "APPROVED" && req.payments.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className={SECTION_TITLE}>Plan de paiement</h2>
            <div className="text-right">
              <p className="text-[13px] leading-[18px] text-ink-muted">Remis : <span className="font-semibold tabular-nums text-success">{fmtAmount(releasedPayments)}</span></p>
              <p className="text-[13px] leading-[18px] text-ink-muted">Total : <span className="font-semibold tabular-nums text-ink">{fmtAmount(totalPayments)}</span></p>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {req.payments.map((p, i) => {
              const isPartial = p.releasedAt && p.releasedAmount != null && Number(p.releasedAmount) < Number(p.amount);
              let paymentStatus: ReactNode;
              if (p.releasedAt) {
                paymentStatus = (
                  <StatusChip tone={isPartial ? "warning" : "success"} icon={Check} className="shrink-0 self-start sm:self-center">
                    {isPartial ? "Partiel" : "Remis"}
                  </StatusChip>
                );
              } else if (canManage) {
                paymentStatus = (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setReleasingPaymentId(p.id);
                      setReleaseDate(new Date().toISOString().slice(0, 10));
                      setReleaseAmount(String(Number(p.amount)));
                      setReleaseAccount("");
                    }}
                  >
                    Confirmer la remise
                  </Button>
                );
              } else {
                paymentStatus = <StatusChip tone="neutral" className="shrink-0 self-start sm:self-center">En attente</StatusChip>;
              }
              return (
              <li key={p.id} className={`flex flex-col gap-3 rounded-control border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${p.releasedAt ? "border-success/30 bg-success-soft" : "border-line"}`}>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[22px] text-ink">
                    Tranche {i + 1} — <span className="tabular-nums">{fmtAmount(p.amount)}</span>
                    {isPartial && (
                      <span className="ml-1.5 text-[13px] font-normal text-warning">
                        (versé : {fmtAmount(p.releasedAmount!)})
                      </span>
                    )}
                  </p>
                  <p className="text-[13px] leading-[18px] text-ink-muted">
                    Prévu : {fmt(p.scheduledDate)}
                    {p.releasedAt ? ` · Remis le ${fmt(p.releasedAt)} par ${p.releasedBy?.name ?? "—"}` : ""}
                  </p>
                  {p.note && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{p.note}</p>}
                  {p.releasedAt && canManage && treasuryAccounts.length > 0 && (
                    <PaymentAccount
                      paymentId={p.id}
                      value={p.treasuryAccountId ?? null}
                      accounts={treasuryAccounts}
                      onSaved={(treasuryAccountId) => {
                        setReq((r) => ({ ...r, payments: r.payments.map((x) => (x.id === p.id ? { ...x, treasuryAccountId } : x)) }));
                        router.refresh();
                      }}
                    />
                  )}
                </div>
                {paymentStatus}
              </li>
            );
            })}
          </ul>
        </section>
      )}

      {!justification && claimable && (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE}>Justificatifs</h2>
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Versée avant la mise en service du suivi : aucun justificatif n&apos;a été demandé. En les réclamant, le
            demandeur est prévenu et relancé comme après une remise.
          </p>
          <Button type="button" className="self-start" onClick={claim} disabled={loading}>
            {loading ? "Envoi…" : "Réclamer les justificatifs"}
          </Button>
        </section>
      )}

      {justification && <JustificationPanel key={`${justification.id}-${justification.status}-${justification.releasedAmount}`} justification={justification} requestId={req.id} treasuryAccounts={treasuryAccounts} />}

      {/* Corrections liées */}
      {req.corrections.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION_TITLE}>Corrections soumises</h2>
          <ul className="-mx-2 flex flex-col">
            {req.corrections.map((c) => (
              <li key={c.id}>
                <Link
                  href={paths.accounting.request(c.id)}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-control px-2 text-[15px] text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <StatusChip tone={STATUS_TONES[c.status] ?? "neutral"} className="shrink-0">{STATUS_LABELS[c.status]}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions comptable — only when an action is possible */}
      {canManage && (req.status === "SUBMITTED" || req.status === "PROCESSING") && (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE}>Actions</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {req.status === "SUBMITTED" && (
              <Button type="button" onClick={() => setProcessOpen(true)} disabled={loading}>
                Prendre en charge
              </Button>
            )}
            {req.status === "PROCESSING" && (
              <Button type="button" onClick={() => setApproveOpen(true)} disabled={loading}>
                <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Valider la demande
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(true)} disabled={loading}>
              Rejeter la demande
            </Button>
          </div>
        </section>
      )}

      {/* Annulation (demandeur) */}
      {isOwn && req.status === "SUBMITTED" && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmCancel(true)}>
            Annuler la demande
          </Button>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Prendre en charge */}
      <Modal open={processOpen} onClose={() => setProcessOpen(false)} title="Prendre en charge la demande">
        <div className="flex flex-col gap-4">
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className={`${fieldLabelClasses} mb-1`}>Priorité</legend>
            <div className="flex gap-2">
              {(["NORMAL", "URGENT"] as const).map((p) => (
                <FilterChip key={p} pressed={priority === p} className="flex-1 justify-center" onClick={() => setPriority(p)}>
                  {p === "URGENT" && <Zap aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                  {p === "URGENT" ? "Urgent" : "Normal"}
                </FilterChip>
              ))}
            </div>
            {priority === "URGENT" && (
              <Input
                label="Délai engagé"
                value={priorityNote}
                onChange={(e) => setPriorityNote(e.target.value)}
                placeholder="Ex. : sous 48 h"
              />
            )}
          </fieldset>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setProcessOpen(false)}>Annuler</Button>
            <Button type="button" onClick={async () => {
              const ok = await patch({ action: "process", priority, priorityNote: priorityNote || undefined });
              if (ok) setProcessOpen(false);
            }} disabled={loading}>
              {loading ? "Enregistrement…" : "Prendre en charge"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Valider */}
      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title="Valider la demande">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">Définissez le ou les paiements pour <strong className="text-ink">{fmtAmount(req.amount)}</strong> au total.</p>
          <div className="flex flex-col gap-3">
            {paymentLines.map((line, i) => (
              <div key={line.id} className="flex items-end gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <Input
                    id={`${uid}-amount-${i}`}
                    label="Montant (€)"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    value={line.amount}
                    onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                  />
                  <Input
                    id={`${uid}-date-${i}`}
                    label="Date prévue"
                    type="date"
                    value={line.scheduledDate}
                    onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, scheduledDate: e.target.value } : l))}
                  />
                </div>
                {paymentLines.length > 1 && (
                  <IconButton
                    icon={X}
                    aria-label={`Retirer la tranche ${i + 1}`}
                    onClick={() => setPaymentLines((ls) => ls.filter((_, j) => j !== i))}
                  />
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setPaymentLines((ls) => [...ls, { id: crypto.randomUUID(), amount: "", scheduledDate: "", note: "" }])}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Ajouter une tranche
            </Button>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setApproveOpen(false)}>Annuler</Button>
            <Button type="button" onClick={async () => {
              const payments = paymentLines.map((l) => ({
                amount: Number.parseFloat(l.amount),
                scheduledDate: new Date(l.scheduledDate).toISOString(),
              }));
              const ok = await patch({ action: "approve", payments });
              if (ok) setApproveOpen(false);
            }} disabled={loading}>
              {loading ? "Enregistrement…" : "Valider la demande"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rejeter */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Rejeter la demande">
        <div className="flex flex-col gap-4">
          <Textarea
            id={`${uid}-reject`}
            label="Motif de rejet"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            placeholder="Précisez la raison du rejet pour le demandeur…"
            hint="Obligatoire : le motif est transmis au demandeur."
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>Annuler</Button>
            <Button type="button" onClick={async () => {
              if (!rejectionReason.trim()) return;
              const ok = await patch({ action: "reject", rejectionReason });
              if (ok) setRejectOpen(false);
            }} disabled={loading || !rejectionReason.trim()}>
              {loading ? "Enregistrement…" : "Rejeter la demande"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmer annulation */}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title={`Annuler la demande « ${req.label} » ?`} mobileLayout="sheet">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">La comptabilité ne la traitera pas. Cette action est irréversible.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirmCancel(false)}>Garder la demande</Button>
            <Button type="button" onClick={async () => {
              const ok = await patch({ action: "cancel" });
              if (ok) setConfirmCancel(false);
            }} disabled={loading}>
              {loading ? "Annulation…" : "Annuler la demande"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmer remise fonds */}
      {(() => {
        const relPayment = req.payments.find((p) => p.id === releasingPaymentId);
        const planned = Number(relPayment?.amount ?? 0);
        const entered = Number.parseFloat(releaseAmount) || 0;
        const remainder = Number((planned - entered).toFixed(2));
        const isPartial = entered > 0 && entered < planned;
        let confirmLabel = "Confirmer la remise";
        if (loading) confirmLabel = "Enregistrement…";
        else if (isPartial) confirmLabel = "Confirmer la remise partielle";
        return (
          <Modal open={releasingPaymentId !== null} onClose={() => setReleasingPaymentId(null)} title="Confirmer la remise des fonds">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id={`${uid}-release-amount`}
                  label="Montant remis (€)"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  max={planned}
                  step={0.01}
                  value={releaseAmount}
                  onChange={(e) => setReleaseAmount(e.target.value)}
                  hint={`Prévu : ${fmtAmount(planned)}`}
                />
                <Input
                  id={`${uid}-release-date`}
                  label="Date de remise"
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                />
              </div>
              {treasuryAccounts.length > 0 && (
                <Select
                  id={`${uid}-release-account`}
                  label="Payé depuis"
                  value={releaseAccount}
                  onChange={(e) => setReleaseAccount(e.target.value)}
                  options={[{ value: "", label: "Compte commun (virement)" }, ...treasuryAccounts.map((a) => ({ value: a.id, label: a.name }))]}
                  hint="Payé depuis une caisse : la sortie apparaît dans la trésorerie, sans ressaisie."
                />
              )}
              {isPartial && (
                <Alert tone="warning">
                  Remise partielle — une tranche résiduelle de <strong>{fmtAmount(remainder)}</strong> sera créée automatiquement.
                </Alert>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setReleasingPaymentId(null)}>Annuler</Button>
                <Button
                  type="button"
                  onClick={() => releasingPaymentId && releasePayment(releasingPaymentId)}
                  disabled={loading || !releaseDate || entered <= 0 || entered > planned}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

    </div>
  );
}

/**
 * Archives de la file (spec 089) : une demande close est archivée d'office ; la compta peut en
 * archiver une à la main, et la désarchiver. Une action en attente la garde dans la file.
 */
function ArchiveBar({ archived, manual, disabled, onChange }: {
  readonly archived: boolean;
  readonly manual: boolean;
  readonly disabled: boolean;
  readonly onChange: (archived: boolean) => void;
}) {
  let hint: string;
  if (archived) hint = manual ? "Hors de la file des demandes." : "Close : archivée d'office, hors de la file des demandes.";
  else if (manual) hint = "Revenue dans la file : une action de la comptabilité est attendue.";
  else hint = "Dans la file des demandes.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
      <div className="flex flex-wrap items-center gap-2">
        {(archived || manual) && <StatusChip tone="neutral" icon={Archive}>Archivée</StatusChip>}
        <p className="text-[15px] leading-[22px] text-ink-muted">{hint}</p>
      </div>
      {manual ? (
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onChange(false)}>
          Désarchiver
        </Button>
      ) : !archived && (
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onChange(true)}>
          <Archive className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Archiver
        </Button>
      )}
    </div>
  );
}

/**
 * « Payé depuis » d'une tranche déjà remise (spec 089) : la compta la rattache après coup à une
 * caisse, ou la remet sur le compte commun ; la sortie suit dans le registre de la trésorerie.
 */
function PaymentAccount({ paymentId, value, accounts, onSaved }: {
  readonly paymentId: string;
  readonly value: string | null;
  readonly accounts: readonly { id: string; name: string }[];
  readonly onSaved: (treasuryAccountId: string | null) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const known = value === null || accounts.some((a) => a.id === value);
  const options = [
    { value: "", label: "Compte commun" },
    ...(known ? [] : [{ value: value!, label: "Compte archivé" }]),
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  async function change(next: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounting/payments/${paymentId}/treasury-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treasuryAccountId: next || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Modification impossible. Réessayez dans un instant.");
        return;
      }
      toast.success(next ? "Tranche rattachée à la caisse." : "Tranche remise sur le compte commun.");
      onSaved(next || null);
    } catch {
      toast.error("Modification impossible. Réessayez dans un instant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 max-w-xs">
      <Select
        label="Payé depuis"
        options={options}
        value={value ?? ""}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
      />
    </div>
  );
}
