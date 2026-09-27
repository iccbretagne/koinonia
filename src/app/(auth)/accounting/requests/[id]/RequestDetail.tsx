"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import AttachmentManager from "@/app/(auth)/accounting/components/AttachmentManager";

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
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:  "bg-warning-soft text-warning",
  PROCESSING: "bg-info-soft text-info",
  APPROVED:   "bg-success-soft text-success",
  REJECTED:   "bg-danger-soft text-danger",
  CANCELLED:  "bg-surface-sunken text-ink-muted",
};
const RECURRENCE_LABELS: Record<string, string> = { WEEK: "semaine(s)", MONTH: "mois" };

interface Payment {
  id: string;
  amount: number | string;
  scheduledDate: string | Date;
  releasedAt: string | Date | null;
  releasedAmount: number | string | null;
  releasedBy: { id: string; name: string | null } | null;
  note: string | null;
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
  createdAt: string | Date;
  processedAt: string | Date | null;
  department: { id: string; name: string; ministry: { name: string } } | null;
  submittedBy: { id: string; name: string | null; email: string | null };
  processedBy: { id: string; name: string | null } | null;
  payments: Payment[];
  attachments: { id: string; filename: string; mimeType: string; size: number; s3Key?: string }[];
  series: { id: string; label: string; recurrenceEvery: number; recurrenceUnit: string; status: string } | null;
  correctionOf: { id: string; label: string; status: string } | null;
  corrections: { id: string; label: string; status: string; createdAt: string | Date }[];
}

interface Props {
  readonly request: Request;
  readonly canManage: boolean;
  readonly isOwn: boolean;
  readonly currentUserId: string;
}

function fmt(d: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtAmount(n: number | string) {
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
// ── Workflow steps ───────────────────────────────────────────────────────────
const STEPS = ["SUBMITTED", "PROCESSING", "APPROVED"];
function WorkflowBar({ status }: { readonly status: string }) {
  const isRejected = status === "REJECTED" || status === "CANCELLED";
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done = !isRejected && (STEPS.indexOf(status) >= i || status === s);
        const current = status === s;
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className={`flex flex-col items-center`} style={{ minWidth: 60 }}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isRejected ? "bg-surface-sunken text-ink-subtle"
                : current ? "bg-brand text-on-brand ring-2 ring-focus/20"
                : done ? "bg-brand-soft text-brand-text"
                : "bg-surface-sunken text-ink-subtle"
              }`}>
                {done && !current ? "✓" : i + 1}
              </div>
              <p className={`text-[10px] mt-1 text-center leading-tight max-w-[60px] ${done ? "text-ink-muted font-medium" : "text-ink-subtle"}`}>
                {STATUS_LABELS[s]}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 -mt-4 mx-1 ${done && !current ? "bg-brand" : "bg-surface-sunken"}`} />
            )}
          </div>
        );
      })}
      {isRejected && (
        <div className="ml-3 flex items-center gap-1.5 text-danger text-xs font-medium">
          <span className="w-5 h-5 rounded-full bg-danger-soft flex items-center justify-center text-xs font-bold">✕</span>
          {STATUS_LABELS[status]}
        </div>
      )}
    </div>
  );
}

export default function RequestDetail({ request: initial, canManage, isOwn }: Props) {
  const router = useRouter();
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
  const [paymentLines, setPaymentLines] = useState([{ amount: String(initial.amount), scheduledDate: "", note: "" }]);
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [releaseAmount, setReleaseAmount] = useState("");

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
    const released = parseFloat(releaseAmount) || planned;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releasedAt:     new Date(releaseDate).toISOString(),
          releasedAmount: released,
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

  const totalPayments = req.payments.reduce((s, p) => s + Number(p.amount), 0);
  const releasedPayments = req.payments
    .filter((p) => p.releasedAt)
    .reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0);

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Header */}
      <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-subtle bg-surface-sunken px-2 py-0.5 rounded">{TYPE_LABELS[req.type]}</span>
              {req.priority === "URGENT" && (
                <span className="text-xs font-medium text-danger bg-danger-soft px-2 py-0.5 rounded border border-danger/30">Urgent</span>
              )}
              {req.series && (
                <span className="text-xs text-brand-text bg-brand-soft px-2 py-0.5 rounded border border-brand/30">
                  Récurrente · tous les {req.series.recurrenceEvery} {RECURRENCE_LABELS[req.series.recurrenceUnit]}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-ink">{req.label}</h1>
            {req.department
              ? <p className="text-sm text-ink-subtle">{req.department.ministry.name} — {req.department.name}</p>
              : <p className="text-sm text-ink-subtle italic">Personnel / sans département</p>
            }
            <p className="text-sm text-ink-subtle">Par {req.submittedBy.name ?? req.submittedBy.email} · {fmt(req.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2 self-start flex-wrap">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[req.status] ?? "bg-surface-sunken text-ink-muted"}`}>
              {STATUS_LABELS[req.status] ?? req.status}
            </span>
            <span className="text-lg font-bold text-ink">{fmtAmount(req.amount)}</span>
          </div>
        </div>

        {/* Progression workflow */}
        <div className="pt-2 border-t border-line">
          <WorkflowBar status={req.status} />
        </div>

        {req.correctionOf && (
          <p className="text-xs text-ink-subtle bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
            Correction de la demande{" "}
            <Link href={`/accounting/requests/${req.correctionOf.id}`} className="text-brand-text hover:underline font-medium">
              &ldquo;{req.correctionOf.label}&rdquo;
            </Link>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">{error}</p>}

      {/* Détails */}
      {req.description && (
        <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-2">
          <h2 className="text-sm font-semibold text-ink-muted">Description</h2>
          <p className="text-sm text-ink-muted whitespace-pre-line">{req.description}</p>
        </div>
      )}

      {/* Pièces jointes */}
      {(req.attachments.length > 0 || (isOwn && req.status === "SUBMITTED")) && (
        <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink-muted">
            Pièces jointes
            {req.attachments.length > 0 && <span className="text-ink-subtle font-normal ml-1">({req.attachments.length})</span>}
          </h2>
          <AttachmentManager
            attachments={req.attachments}
            requestId={req.id}
            canUpload={isOwn && req.status === "SUBMITTED"}
            canDelete={isOwn && req.status === "SUBMITTED"}
            onChange={(updated) => setReq((r) => ({ ...r, attachments: updated }))}
          />
        </div>
      )}

      {/* Priorité + note compta */}
      {req.status === "PROCESSING" && (req.priority || req.priorityNote) && (
        <div className={`rounded-xl border p-4 space-y-1 ${req.priority === "URGENT" ? "bg-danger-soft border-danger/30" : "bg-info-soft border-info/30"}`}>
          <p className={`text-sm font-semibold ${req.priority === "URGENT" ? "text-danger" : "text-info"}`}>
            {req.priority === "URGENT" ? "⚡ Traitement urgent" : "En cours de traitement"}
          </p>
          {req.priorityNote && <p className="text-sm text-ink-muted">{req.priorityNote}</p>}
        </div>
      )}

      {/* Motif de rejet */}
      {req.status === "REJECTED" && req.rejectionReason && (
        <div className="bg-danger-soft border border-danger/30 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-danger">Demande rejetée</p>
          <p className="text-sm text-ink-muted">{req.rejectionReason}</p>
          {isOwn && (
            <a
              href={`/accounting/requests/new?correctionOf=${req.id}`}
              className="inline-block mt-2 text-xs font-medium text-brand-text border border-brand/40 px-3 py-1.5 rounded-lg hover:bg-brand-hover hover:text-on-brand transition-colors"
            >
              Corriger et resoumettre →
            </a>
          )}
        </div>
      )}

      {/* Plan de paiement */}
      {req.status === "APPROVED" && req.payments.length > 0 && (
        <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-muted">Plan de paiement</h2>
            <div className="text-right">
              <p className="text-xs text-ink-subtle">Remis : <span className="font-semibold text-success">{fmtAmount(releasedPayments)}</span></p>
              <p className="text-xs text-ink-subtle">Total : <span className="font-medium text-ink-muted">{fmtAmount(totalPayments)}</span></p>
            </div>
          </div>
          <div className="space-y-2">
            {req.payments.map((p, i) => {
              const isPartial = p.releasedAt && p.releasedAmount != null && Number(p.releasedAmount) < Number(p.amount);
              return (
              <div key={p.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border ${p.releasedAt ? "bg-success-soft border-success/30" : "bg-surface-sunken border-line"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    Tranche {i + 1} — {fmtAmount(p.amount)}
                    {isPartial && (
                      <span className="ml-1.5 text-xs font-normal text-warning">
                        (versé : {fmtAmount(p.releasedAmount!)})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    Prévu : {fmt(p.scheduledDate)}
                    {p.releasedAt ? ` · Remis le ${fmt(p.releasedAt)} par ${p.releasedBy?.name ?? "—"}` : ""}
                  </p>
                  {p.note && <p className="text-xs text-ink-muted mt-0.5">{p.note}</p>}
                </div>
                {p.releasedAt ? (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isPartial ? "text-warning bg-warning-soft" : "text-success bg-success-soft"}`}>
                    {isPartial ? "Partiel ✓" : "Remis ✓"}
                  </span>
                ) : canManage ? (
                  <button
                    onClick={() => {
                      setReleasingPaymentId(p.id);
                      setReleaseDate(new Date().toISOString().slice(0, 10));
                      setReleaseAmount(String(Number(p.amount)));
                    }}
                    className="shrink-0 text-xs font-medium text-brand-text border border-brand/40 px-2.5 py-1 rounded-full hover:bg-brand-hover hover:text-on-brand transition-colors"
                  >
                    Confirmer remise
                  </button>
                ) : (
                  <span className="text-xs text-ink-subtle shrink-0">En attente</span>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Corrections liées */}
      {req.corrections.length > 0 && (
        <div className="bg-surface rounded-xl border border-line p-4 space-y-2">
          <h2 className="text-sm font-semibold text-ink-muted">Corrections soumises</h2>
          {req.corrections.map((c) => (
            <a key={c.id} href={`/accounting/requests/${c.id}`} className="flex items-center justify-between text-sm text-brand-text hover:underline">
              <span>{c.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-surface-sunken text-ink-muted"}`}>{STATUS_LABELS[c.status]}</span>
            </a>
          ))}
        </div>
      )}

      {/* Actions comptable — only when an action is possible */}
      {canManage && (req.status === "SUBMITTED" || req.status === "PROCESSING") && (
        <div className="bg-surface rounded-xl border border-line p-4 space-y-3">
          <h2 className="text-sm font-semibold text-ink-muted">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {req.status === "SUBMITTED" && (
              <button onClick={() => setProcessOpen(true)} disabled={loading}
                className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                Prendre en charge
              </button>
            )}
            {req.status === "PROCESSING" && (
              <button onClick={() => setApproveOpen(true)} disabled={loading}
                className="px-4 py-2 bg-success text-surface text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                Valider ✓
              </button>
            )}
            {(req.status === "SUBMITTED" || req.status === "PROCESSING") && (
              <button onClick={() => setRejectOpen(true)} disabled={loading}
                className="px-4 py-2 bg-surface text-danger border border-danger/30 text-sm font-medium rounded-lg hover:bg-danger-soft disabled:opacity-50 transition-colors">
                Rejeter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Annulation (demandeur) */}
      {isOwn && req.status === "SUBMITTED" && (
        <div className="flex justify-end">
          <button
            onClick={() => setConfirmCancel(true)}
            className="text-xs text-ink-subtle hover:text-danger transition-colors"
          >
            Annuler cette demande
          </button>
        </div>
      )}

      {/* ── Modals ── */}

      {/* Prendre en charge */}
      <Modal open={processOpen} onClose={() => setProcessOpen(false)} title="Prendre en charge la demande">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink-muted">Priorité</label>
            <div className="flex gap-2">
              {(["NORMAL", "URGENT"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${priority === p ? (p === "URGENT" ? "border-danger bg-danger-soft text-danger" : "border-brand bg-brand-soft text-brand-text") : "border-line text-ink-muted"}`}>
                  {p === "URGENT" ? "⚡ Urgent" : "Normal"}
                </button>
              ))}
            </div>
            {priority === "URGENT" && (
              <input type="text" value={priorityNote} onChange={(e) => setPriorityNote(e.target.value)}
                placeholder="Délai engagé (ex : sous 48h)…"
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-danger" />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setProcessOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={async () => {
              const ok = await patch({ action: "process", priority, priorityNote: priorityNote || undefined });
              if (ok) setProcessOpen(false);
            }} disabled={loading}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Valider */}
      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title="Valider la demande">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Définissez le ou les paiements pour <strong>{fmtAmount(req.amount)}</strong> au total.</p>
          <div className="space-y-2">
            {paymentLines.map((line, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Montant (€)</label>
                  <input type="number" min={0.01} step={0.01} value={line.amount}
                    onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-success" />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">Date prévue</label>
                  <div className="flex gap-1">
                    <input type="date" value={line.scheduledDate}
                      onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, scheduledDate: e.target.value } : l))}
                      className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-success" />
                    {paymentLines.length > 1 && (
                      <button type="button" onClick={() => setPaymentLines((ls) => ls.filter((_, j) => j !== i))}
                        className="px-2 text-danger hover:text-danger">✕</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setPaymentLines((ls) => [...ls, { amount: "", scheduledDate: "", note: "" }])}
              className="text-xs text-brand-text hover:underline">
              + Ajouter une tranche
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setApproveOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={async () => {
              const payments = paymentLines.map((l) => ({
                amount: parseFloat(l.amount),
                scheduledDate: new Date(l.scheduledDate).toISOString(),
              }));
              const ok = await patch({ action: "approve", payments });
              if (ok) setApproveOpen(false);
            }} disabled={loading}
              className="px-4 py-2 bg-success text-surface text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Valider la demande"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rejeter */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Rejeter la demande">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1">Motif de rejet</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
              rows={3} placeholder="Précisez la raison du rejet pour le demandeur…"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-danger resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRejectOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={async () => {
              if (!rejectionReason.trim()) return;
              const ok = await patch({ action: "reject", rejectionReason });
              if (ok) setRejectOpen(false);
            }} disabled={loading || !rejectionReason.trim()}
              className="px-4 py-2 bg-danger text-on-danger text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Rejeter"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmer annulation */}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Annuler la demande">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Confirmer l&apos;annulation de &quot;{req.label}&quot; ? Cette action est irréversible.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmCancel(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Retour</button>
            <button onClick={async () => {
              const ok = await patch({ action: "cancel" });
              if (ok) setConfirmCancel(false);
            }} disabled={loading}
              className="px-4 py-2 bg-danger text-on-danger text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Annulation…" : "Confirmer l'annulation"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmer remise fonds */}
      {(() => {
        const relPayment = req.payments.find((p) => p.id === releasingPaymentId);
        const planned = Number(relPayment?.amount ?? 0);
        const entered = parseFloat(releaseAmount) || 0;
        const remainder = Number((planned - entered).toFixed(2));
        const isPartial = entered > 0 && entered < planned;
        return (
          <Modal open={releasingPaymentId !== null} onClose={() => setReleasingPaymentId(null)} title="Confirmer la remise des fonds">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Montant remis (€)</label>
                  <input type="number" min={0.01} max={planned} step={0.01} value={releaseAmount}
                    onChange={(e) => setReleaseAmount(e.target.value)}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-success" />
                  <p className="text-xs text-ink-subtle mt-1">Prévu : {fmtAmount(planned)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Date de remise</label>
                  <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-success" />
                </div>
              </div>
              {isPartial && (
                <div className="bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning">
                  Remise partielle — une tranche résiduelle de <strong>{fmtAmount(remainder)}</strong> sera créée automatiquement.
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReleasingPaymentId(null)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
                <button
                  onClick={() => releasingPaymentId && releasePayment(releasingPaymentId)}
                  disabled={loading || !releaseDate || entered <= 0 || entered > planned}
                  className="px-4 py-2 bg-success text-surface text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? "Enregistrement…" : isPartial ? "Confirmer (partiel)" : "Confirmer la remise"}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

    </div>
  );
}
