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
  SUBMITTED:  "bg-amber-100 text-amber-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  APPROVED:   "bg-emerald-100 text-emerald-800",
  REJECTED:   "bg-red-100 text-red-600",
  CANCELLED:  "bg-gray-100 text-gray-500",
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
  request: Request;
  canManage: boolean;
  isOwn: boolean;
  currentUserId: string;
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
function WorkflowBar({ status }: { status: string }) {
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
                isRejected ? "bg-gray-100 text-gray-300"
                : current ? "bg-icc-violet text-white ring-2 ring-icc-violet/20"
                : done ? "bg-icc-violet/15 text-icc-violet"
                : "bg-gray-100 text-gray-400"
              }`}>
                {done && !current ? "✓" : i + 1}
              </div>
              <p className={`text-[10px] mt-1 text-center leading-tight max-w-[60px] ${done ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                {STATUS_LABELS[s]}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 -mt-4 mx-1 ${done && !current ? "bg-icc-violet" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
      {isRejected && (
        <div className="ml-3 flex items-center gap-1.5 text-red-500 text-xs font-medium">
          <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold">✕</span>
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
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{TYPE_LABELS[req.type]}</span>
              {req.priority === "URGENT" && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">Urgent</span>
              )}
              {req.series && (
                <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                  Récurrente · tous les {req.series.recurrenceEvery} {RECURRENCE_LABELS[req.series.recurrenceUnit]}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{req.label}</h1>
            {req.department
              ? <p className="text-sm text-gray-400">{req.department.ministry.name} — {req.department.name}</p>
              : <p className="text-sm text-gray-400 italic">Personnel / sans département</p>
            }
            <p className="text-sm text-gray-400">Par {req.submittedBy.name ?? req.submittedBy.email} · {fmt(req.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2 self-start flex-wrap">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600"}`}>
              {STATUS_LABELS[req.status] ?? req.status}
            </span>
            <span className="text-lg font-bold text-gray-900">{fmtAmount(req.amount)}</span>
          </div>
        </div>

        {/* Progression workflow */}
        <div className="pt-2 border-t border-gray-100">
          <WorkflowBar status={req.status} />
        </div>

        {req.correctionOf && (
          <p className="text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Correction de la demande{" "}
            <Link href={`/accounting/requests/${req.correctionOf.id}`} className="text-icc-violet hover:underline font-medium">
              &ldquo;{req.correctionOf.label}&rdquo;
            </Link>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {/* Détails */}
      {req.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Description</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line">{req.description}</p>
        </div>
      )}

      {/* Pièces jointes */}
      {(req.attachments.length > 0 || (isOwn && req.status === "SUBMITTED")) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Pièces jointes
            {req.attachments.length > 0 && <span className="text-gray-400 font-normal ml-1">({req.attachments.length})</span>}
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
        <div className={`rounded-xl border p-4 space-y-1 ${req.priority === "URGENT" ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100"}`}>
          <p className={`text-sm font-semibold ${req.priority === "URGENT" ? "text-red-700" : "text-blue-700"}`}>
            {req.priority === "URGENT" ? "⚡ Traitement urgent" : "En cours de traitement"}
          </p>
          {req.priorityNote && <p className="text-sm text-gray-600">{req.priorityNote}</p>}
        </div>
      )}

      {/* Motif de rejet */}
      {req.status === "REJECTED" && req.rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-red-700">Demande rejetée</p>
          <p className="text-sm text-gray-600">{req.rejectionReason}</p>
          {isOwn && (
            <a
              href={`/accounting/requests/new?correctionOf=${req.id}`}
              className="inline-block mt-2 text-xs font-medium text-icc-violet border border-icc-violet/40 px-3 py-1.5 rounded-lg hover:bg-icc-violet hover:text-white transition-colors"
            >
              Corriger et resoumettre →
            </a>
          )}
        </div>
      )}

      {/* Plan de paiement */}
      {req.status === "APPROVED" && req.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Plan de paiement</h2>
            <div className="text-right">
              <p className="text-xs text-gray-400">Remis : <span className="font-semibold text-emerald-600">{fmtAmount(releasedPayments)}</span></p>
              <p className="text-xs text-gray-400">Total : <span className="font-medium text-gray-700">{fmtAmount(totalPayments)}</span></p>
            </div>
          </div>
          <div className="space-y-2">
            {req.payments.map((p, i) => {
              const isPartial = p.releasedAt && p.releasedAmount != null && Number(p.releasedAmount) < Number(p.amount);
              return (
              <div key={p.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border ${p.releasedAt ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-200"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Tranche {i + 1} — {fmtAmount(p.amount)}
                    {isPartial && (
                      <span className="ml-1.5 text-xs font-normal text-amber-600">
                        (versé : {fmtAmount(p.releasedAmount!)})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    Prévu : {fmt(p.scheduledDate)}
                    {p.releasedAt ? ` · Remis le ${fmt(p.releasedAt)} par ${p.releasedBy?.name ?? "—"}` : ""}
                  </p>
                  {p.note && <p className="text-xs text-gray-500 mt-0.5">{p.note}</p>}
                </div>
                {p.releasedAt ? (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${isPartial ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-100"}`}>
                    {isPartial ? "Partiel ✓" : "Remis ✓"}
                  </span>
                ) : canManage ? (
                  <button
                    onClick={() => {
                      setReleasingPaymentId(p.id);
                      setReleaseDate(new Date().toISOString().slice(0, 10));
                      setReleaseAmount(String(Number(p.amount)));
                    }}
                    className="shrink-0 text-xs font-medium text-icc-violet border border-icc-violet/40 px-2.5 py-1 rounded-full hover:bg-icc-violet hover:text-white transition-colors"
                  >
                    Confirmer remise
                  </button>
                ) : (
                  <span className="text-xs text-gray-400 shrink-0">En attente</span>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Corrections liées */}
      {req.corrections.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Corrections soumises</h2>
          {req.corrections.map((c) => (
            <a key={c.id} href={`/accounting/requests/${c.id}`} className="flex items-center justify-between text-sm text-icc-violet hover:underline">
              <span>{c.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-500"}`}>{STATUS_LABELS[c.status]}</span>
            </a>
          ))}
        </div>
      )}

      {/* Actions comptable — only when an action is possible */}
      {canManage && (req.status === "SUBMITTED" || req.status === "PROCESSING") && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {req.status === "SUBMITTED" && (
              <button onClick={() => setProcessOpen(true)} disabled={loading}
                className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                Prendre en charge
              </button>
            )}
            {req.status === "PROCESSING" && (
              <button onClick={() => setApproveOpen(true)} disabled={loading}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                Valider ✓
              </button>
            )}
            {(req.status === "SUBMITTED" || req.status === "PROCESSING") && (
              <button onClick={() => setRejectOpen(true)} disabled={loading}
                className="px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
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
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
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
            <label className="block text-sm font-medium text-gray-700">Priorité</label>
            <div className="flex gap-2">
              {(["NORMAL", "URGENT"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${priority === p ? (p === "URGENT" ? "border-red-500 bg-red-50 text-red-700" : "border-icc-violet bg-icc-violet/5 text-icc-violet") : "border-gray-200 text-gray-600"}`}>
                  {p === "URGENT" ? "⚡ Urgent" : "Normal"}
                </button>
              ))}
            </div>
            {priority === "URGENT" && (
              <input type="text" value={priorityNote} onChange={(e) => setPriorityNote(e.target.value)}
                placeholder="Délai engagé (ex : sous 48h)…"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setProcessOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={async () => {
              const ok = await patch({ action: "process", priority, priorityNote: priorityNote || undefined });
              if (ok) setProcessOpen(false);
            }} disabled={loading}
              className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Valider */}
      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title="Valider la demande">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Définissez le ou les paiements pour <strong>{fmtAmount(req.amount)}</strong> au total.</p>
          <div className="space-y-2">
            {paymentLines.map((line, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Montant (€)</label>
                  <input type="number" min={0.01} step={0.01} value={line.amount}
                    onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date prévue</label>
                  <div className="flex gap-1">
                    <input type="date" value={line.scheduledDate}
                      onChange={(e) => setPaymentLines((ls) => ls.map((l, j) => j === i ? { ...l, scheduledDate: e.target.value } : l))}
                      className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                    {paymentLines.length > 1 && (
                      <button type="button" onClick={() => setPaymentLines((ls) => ls.filter((_, j) => j !== i))}
                        className="px-2 text-red-400 hover:text-red-600">✕</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setPaymentLines((ls) => [...ls, { amount: "", scheduledDate: "", note: "" }])}
              className="text-xs text-icc-violet hover:underline">
              + Ajouter une tranche
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setApproveOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={async () => {
              const payments = paymentLines.map((l) => ({
                amount: parseFloat(l.amount),
                scheduledDate: new Date(l.scheduledDate).toISOString(),
              }));
              const ok = await patch({ action: "approve", payments });
              if (ok) setApproveOpen(false);
            }} disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Valider la demande"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rejeter */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Rejeter la demande">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif de rejet</label>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
              rows={3} placeholder="Précisez la raison du rejet pour le demandeur…"
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRejectOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={async () => {
              if (!rejectionReason.trim()) return;
              const ok = await patch({ action: "reject", rejectionReason });
              if (ok) setRejectOpen(false);
            }} disabled={loading || !rejectionReason.trim()}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Enregistrement…" : "Rejeter"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmer annulation */}
      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Annuler la demande">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Confirmer l&apos;annulation de &quot;{req.label}&quot; ? Cette action est irréversible.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmCancel(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Retour</button>
            <button onClick={async () => {
              const ok = await patch({ action: "cancel" });
              if (ok) setConfirmCancel(false);
            }} disabled={loading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Montant remis (€)</label>
                  <input type="number" min={0.01} max={planned} step={0.01} value={releaseAmount}
                    onChange={(e) => setReleaseAmount(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                  <p className="text-xs text-gray-400 mt-1">Prévu : {fmtAmount(planned)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de remise</label>
                  <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                </div>
              </div>
              {isPartial && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Remise partielle — une tranche résiduelle de <strong>{fmtAmount(remainder)}</strong> sera créée automatiquement.
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReleasingPaymentId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                <button
                  onClick={() => releasingPaymentId && releasePayment(releasingPaymentId)}
                  disabled={loading || !releaseDate || entered <= 0 || entered > planned}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
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
