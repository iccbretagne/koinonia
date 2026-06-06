"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";

// ── Labels ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:      "En attente",
  ASSIGNED:       "Assigné",
  CONTACTED:      "Contacté",
  WHATSAPP_ADDED: "Ajouté dans le groupe WhatsApp famille",
  INTEGRATED:     "Intégré",
  ABANDONED:      "Abandonné",
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:      "bg-amber-100 text-amber-800",
  ASSIGNED:       "bg-blue-100 text-blue-800",
  CONTACTED:      "bg-indigo-100 text-indigo-800",
  WHATSAPP_ADDED: "bg-green-100 text-green-700",
  INTEGRATED:     "bg-emerald-100 text-emerald-800",
  ABANDONED:      "bg-red-100 text-red-600",
};

const AGE_LABELS: Record<string, string> = {
  YOUTH: "Jeune (−18 ans)",
  YOUNG_ADULT: "Jeune adulte (18–30 ans)",
  ADULT: "Adulte (30–60 ans)",
  SENIOR: "Senior (60+ ans)",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visiteur — je découvre",
  REGULAR: "Régulier — je viens souvent",
  ENGAGED: "Engagé — je sers",
};

const WORKFLOW_STEPS = [
  { status: "SUBMITTED",      label: "Soumise",         tsKey: "submittedAt" },
  { status: "ASSIGNED",       label: "Assignée",         tsKey: "assignedAt" },
  { status: "CONTACTED",      label: "Contacté·e",       tsKey: "contactedAt" },
  { status: "WHATSAPP_ADDED", label: "Ajouté dans le groupe WhatsApp famille",  tsKey: "whatsappAddedAt" },
  { status: "INTEGRATED",     label: "Intégré·e",        tsKey: "integratedAt" },
];

const STATUS_ORDER = ["SUBMITTED", "ASSIGNED", "CONTACTED", "WHATSAPP_ADDED", "INTEGRATED"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Request {
  id: string;
  churchId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  ageRange: string;
  churchStatus: string;
  status: string;
  submittedAt: Date | string;
  assignedAt: Date | string | null;
  contactedAt: Date | string | null;
  whatsappAddedAt: Date | string | null;
  integratedAt: Date | string | null;
  abandonedAt: Date | string | null;
  abandonReason: string | null;
  suggestedFamilyName: string | null;
  assignedFamilyId: number | null;
  assignedFamilyName: string | null;
  assignedBerger: { id: string; name: string | null; email: string | null } | null;
  member: { id: string; firstName: string; lastName: string } | null;
  appointmentRequest: { id: string; status: string } | null;
  pastoralCareRequested: boolean;
  notes: string | null;
  lat: number | null;
  lng: number | null;
}

interface Family { id: number; name: string; }
interface Leader { id: string; userId: string; familyId: number; role: string; user: { id: string; name: string | null; email: string | null }; }

interface Props {
  request: Request;
  churchId: string;
  isScoped: boolean;
  currentUserId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtFull(d: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Section card ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
      <span className="text-xs text-gray-400 shrink-0 sm:w-36">{label}</span>
      <span className="text-sm text-gray-800">{value ?? <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RequestDetail({ request: initial, churchId, isScoped, currentUserId }: Props) {
  const router = useRouter();
  const [req, setReq] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [notesLoading, setNotesLoading] = useState(false);

  // Assign modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [families, setFamilies] = useState<Family[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [assignFamilyId, setAssignFamilyId] = useState<string>("");
  const [assignBergerId, setAssignBergerId] = useState<string>("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Abandon modal
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [abandonLoading, setAbandonLoading] = useState(false);

  // ── API helpers ─────────────────────────────────────────────────────────────

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/integration/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return false; }
      setReq((prev) => ({ ...prev, ...json }));
      router.refresh();
      return true;
    } catch { setError("Erreur réseau"); return false; }
    finally { setLoading(false); }
  }

  async function openAssignModal() {
    setAssignOpen(true);
    setModalLoading(true);
    setAssignFamilyId(req.assignedFamilyId?.toString() ?? "");
    setAssignBergerId(req.assignedBerger?.id ?? "");
    try {
      const [famRes, leadRes] = await Promise.all([
        fetch(`/api/integration/families?churchId=${churchId}`),
        fetch(`/api/integration/leaders?churchId=${churchId}`),
      ]);
      const [famJson, leadJson] = await Promise.all([famRes.json(), leadRes.json()]);
      setFamilies(famJson.families ?? []);
      setLeaders(leadJson ?? []);
    } catch { /* silently ignore */ }
    finally { setModalLoading(false); }
  }

  async function submitAssign() {
    const family = families.find((f) => f.id === parseInt(assignFamilyId));
    if (!family || !assignBergerId) return;
    setAssignLoading(true);
    const ok = await patch({
      action: "assign",
      assignedFamilyId: family.id,
      assignedFamilyName: family.name,
      assignedBergerId: assignBergerId,
    });
    setAssignLoading(false);
    if (ok) setAssignOpen(false);
  }

  async function submitAbandon() {
    setAbandonLoading(true);
    const ok = await patch({ action: "abandon", abandonReason: abandonReason || undefined });
    setAbandonLoading(false);
    if (ok) { setAbandonOpen(false); setAbandonReason(""); }
  }

  async function saveNotes() {
    setNotesLoading(true);
    const res = await fetch(`/api/integration/requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", notes }),
    });
    setNotesLoading(false);
    if (!res.ok) setError("Erreur lors de la sauvegarde des notes");
  }

  // ── Filtered leaders for selected family ────────────────────────────────────

  const filteredLeaders = assignFamilyId
    ? leaders.filter((l) => l.familyId === parseInt(assignFamilyId))
    : leaders;

  // ── Role helpers ─────────────────────────────────────────────────────────────

  const isManager = !isScoped;
  const isAssignedBerger = req.assignedBerger?.id === currentUserId;
  const canActAsBerger = isManager || isAssignedBerger;

  // ── Status position ──────────────────────────────────────────────────────────

  const currentIdx = STATUS_ORDER.indexOf(req.status);
  const isAbandoned = req.status === "ABANDONED";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 p-4 md:p-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{req.firstName} {req.lastName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fmt(req.submittedAt)}</p>
        </div>
        <span className={`self-start sm:self-center inline-flex px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600"}`}>
          {STATUS_LABELS[req.status] ?? req.status}
        </span>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Actions workflow */}
      {(isManager || canActAsBerger) && (
        <div className="space-y-2">
          {/* Bandeau contextuel pour le berger */}
          {isAssignedBerger && !isManager && (
            <div className="flex items-center gap-2 text-xs text-icc-violet bg-icc-violet/5 border border-icc-violet/20 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Vous êtes le berger assigné à cette demande.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {/* Actions manager uniquement */}
            {isManager && (req.status === "SUBMITTED" || req.status === "ASSIGNED") && (
              <button
                onClick={openAssignModal}
                disabled={loading}
                className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {req.status === "ASSIGNED" ? "Réaffecter" : "Assigner"}
              </button>
            )}
            {isManager && req.status === "ABANDONED" && (
              <button
                onClick={() => patch({ action: "reopen" })}
                disabled={loading}
                className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Rouvrir
              </button>
            )}

            {/* Actions berger (et manager) */}
            {canActAsBerger && req.status === "ASSIGNED" && (
              <button
                onClick={() => patch({ action: "contact" })}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Marquer contacté
              </button>
            )}
            {canActAsBerger && req.status === "CONTACTED" && (
              <button
                onClick={() => patch({ action: "whatsapp" })}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Ajouté dans le groupe WhatsApp
              </button>
            )}
            {canActAsBerger && req.status === "WHATSAPP_ADDED" && (
              <button
                onClick={() => patch({ action: "integrate" })}
                disabled={loading}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Marquer intégré ✓
              </button>
            )}
            {canActAsBerger && req.status !== "INTEGRATED" && req.status !== "ABANDONED" && (
              <button
                onClick={() => setAbandonOpen(true)}
                disabled={loading}
                className="px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Abandonner
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact */}
        <Card title="Contact">
          <Row label="Téléphone" value={req.phone ? <a href={`tel:${req.phone}`} className="text-icc-violet hover:underline">{req.phone}</a> : null} />
          <Row label="Email" value={req.email ? <a href={`mailto:${req.email}`} className="text-icc-violet hover:underline">{req.email}</a> : null} />
          <Row label="Adresse" value={req.address} />
          {req.member && (
            <Row label="Membre Koinonia" value={`${req.member.firstName} ${req.member.lastName}`} />
          )}
        </Card>

        {/* Profil */}
        <Card title="Profil">
          <Row label="Tranche d'âge" value={AGE_LABELS[req.ageRange] ?? req.ageRange} />
          <Row label="Situation" value={CHURCH_STATUS_LABELS[req.churchStatus] ?? req.churchStatus} />
          <Row label="Soin pastoral" value={req.pastoralCareRequested ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              Demandé
              {req.appointmentRequest && (
                <span className="ml-1 text-xs text-gray-400">({req.appointmentRequest.status})</span>
              )}
            </span>
          ) : "Non"} />
        </Card>

        {/* Famille */}
        <Card title="Famille">
          {req.suggestedFamilyName && (
            <Row label="Suggestion géo" value={
              <span className="text-gray-500 italic">{req.suggestedFamilyName}</span>
            } />
          )}
          {req.lat && req.lng && (
            <Row label="Coordonnées" value={
              <a
                href={`https://maps.google.com/?q=${req.lat},${req.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-icc-violet hover:underline text-xs"
              >
                Voir sur la carte ↗
              </a>
            } />
          )}
          <Row label="Famille assignée" value={req.assignedFamilyName ? (
            <span className="font-medium text-icc-violet">{req.assignedFamilyName}</span>
          ) : null} />
          <Row label="Berger" value={req.assignedBerger?.name ?? null} />
        </Card>

        {/* Timeline */}
        <Card title="Progression">
          {isAbandoned ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs">✕</span>
                Abandonné le {fmt(req.abandonedAt)}
              </div>
              {req.abandonReason && (
                <p className="text-xs text-gray-500 pl-7">{req.abandonReason}</p>
              )}
            </div>
          ) : (
            <ol className="space-y-2">
              {WORKFLOW_STEPS.map((step, i) => {
                const ts = req[step.tsKey as keyof Request] as Date | string | null;
                const done = i <= currentIdx;
                const current = STATUS_ORDER[currentIdx] === step.status;
                return (
                  <li key={step.status} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      done
                        ? current
                          ? "bg-icc-violet text-white"
                          : "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-400"
                    }`}>
                      {done && !current ? "✓" : i + 1}
                    </span>
                    <div>
                      <p className={`text-sm ${done ? "text-gray-800 font-medium" : "text-gray-400"}`}>
                        {step.label}
                      </p>
                      {ts && <p className="text-xs text-gray-400">{fmtFull(ts)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      {/* Notes internes */}
      {!isScoped && (
        <Card title="Notes internes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Notes visibles uniquement par l'équipe intégration…"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={saveNotes}
              disabled={notesLoading}
              className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {notesLoading ? "Sauvegarde…" : "Enregistrer les notes"}
            </button>
          </div>
        </Card>
      )}

      {/* Modal : Assigner */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assigner la demande">
        {modalLoading ? (
          <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Famille</label>
              <select
                value={assignFamilyId}
                onChange={(e) => { setAssignFamilyId(e.target.value); setAssignBergerId(""); }}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
              >
                <option value="">Choisir une famille…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {req.suggestedFamilyName && (
                <p className="text-xs text-gray-400 mt-1">Suggestion géo : {req.suggestedFamilyName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Berger / co-berger</label>
              <select
                value={assignBergerId}
                onChange={(e) => setAssignBergerId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
                disabled={!assignFamilyId}
              >
                <option value="">Choisir un berger…</option>
                {filteredLeaders.map((l) => (
                  <option key={l.id} value={l.user.id}>
                    {l.user.name ?? l.user.email} ({l.role === "BERGER" ? "Berger" : "Co-berger"})
                  </option>
                ))}
              </select>
              {assignFamilyId && filteredLeaders.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Aucun berger configuré pour cette famille.{" "}
                  <a href="/integration/leaders" className="underline">Configurer →</a>
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setAssignOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annuler
              </button>
              <button
                onClick={submitAssign}
                disabled={assignLoading || !assignFamilyId || !assignBergerId}
                className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {assignLoading ? "Enregistrement…" : "Assigner"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal : Abandonner */}
      <Modal open={abandonOpen} onClose={() => setAbandonOpen(false)} title="Abandonner la demande">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Cette demande sera marquée comme abandonnée. Elle pourra être rouverte si nécessaire.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Raison (facultatif)</label>
            <textarea
              value={abandonReason}
              onChange={(e) => setAbandonReason(e.target.value)}
              rows={3}
              placeholder="Ex : sans nouvelles après 3 relances…"
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setAbandonOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              onClick={submitAbandon}
              disabled={abandonLoading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {abandonLoading ? "Abandon…" : "Confirmer l'abandon"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
