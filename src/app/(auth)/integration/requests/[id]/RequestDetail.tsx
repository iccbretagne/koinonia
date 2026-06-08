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

// ── MSDP labels ───────────────────────────────────────────────────────────────

const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED:    "Appel reçu",
  ASSIGNED:     "Conseiller assigné",
  CONTACTED:    "Premier contact établi",
  IN_FORMATION: "En formation PCNC",
  COMPLETED:    "Terminé",
  ABANDONED:    "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED:    "bg-amber-100 text-amber-800",
  ASSIGNED:     "bg-blue-100 text-blue-800",
  CONTACTED:    "bg-indigo-100 text-indigo-800",
  IN_FORMATION: "bg-purple-100 text-purple-800",
  COMPLETED:    "bg-emerald-100 text-emerald-800",
  ABANDONED:    "bg-red-100 text-red-600",
};

const MSDP_WORKFLOW_STEPS = [
  { status: "SUBMITTED",    label: "Appel reçu",          tsKey: "createdAt" },
  { status: "ASSIGNED",     label: "Conseiller assigné",  tsKey: "assignedAt" },
  { status: "CONTACTED",    label: "Premier contact",     tsKey: "contactedAt" },
  { status: "IN_FORMATION", label: "En formation PCNC",   tsKey: "inFormationAt" },
  { status: "COMPLETED",    label: "Terminé",             tsKey: "completedAt" },
];

const MSDP_STATUS_ORDER = ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION", "COMPLETED"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface MsdpFollowUpType {
  id: string;
  status: string;
  assignedConseillerMsdpId: string | null;
  assignedConseillerMsdp: { id: string; name: string | null; email: string | null } | null;
  assignedAt: Date | string | null;
  contactedAt: Date | string | null;
  inFormationAt: Date | string | null;
  completedAt: Date | string | null;
  abandonedAt: Date | string | null;
  integratedToFamily: boolean;
  isStar: boolean;
  followsPcnc: boolean;
  notes: string | null;
  createdAt: Date | string;
}

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
  salvationCall: boolean;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  msdpFollowUp: MsdpFollowUpType | null;
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

// ── MSDP Section ──────────────────────────────────────────────────────────────

interface MsdpSectionProps {
  initialFollowUp: MsdpFollowUpType | null;
  requestId: string;
  churchId: string;
  isIntegrationMember: boolean;
  currentUserId: string;
}

function MsdpSection({ initialFollowUp, requestId, churchId, isIntegrationMember, currentUserId }: MsdpSectionProps) {
  const [followUp, setFollowUp] = useState<MsdpFollowUpType | null>(initialFollowUp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msdpNotes, setMsdpNotes] = useState(initialFollowUp?.notes ?? "");
  const [notesLoading, setNotesLoading] = useState(false);

  // Assign counselor modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [counselors, setCounselors] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [selectedCounselorId, setSelectedCounselorId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Complete modal
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeFlags, setCompleteFlags] = useState({ integratedToFamily: false, isStar: false, followsPcnc: false });
  const [completeLoading, setCompleteLoading] = useState(false);

  const isCounselor = followUp?.assignedConseillerMsdpId === currentUserId;
  const canAct = isIntegrationMember || isCounselor;

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integration/msdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, churchId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      setFollowUp(json);
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  async function patch(body: Record<string, unknown>) {
    if (!followUp) return false;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/integration/msdp/${followUp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return false; }
      setFollowUp(json);
      return true;
    } catch { setError("Erreur réseau"); return false; }
    finally { setLoading(false); }
  }

  async function openAssignModal() {
    setAssignOpen(true);
    setSelectedCounselorId(followUp?.assignedConseillerMsdpId ?? "");
    setModalLoading(true);
    try {
      const res = await fetch(`/api/integration/msdp/counselors?churchId=${churchId}`);
      const json = await res.json();
      setCounselors(json ?? []);
    } catch { /* ignore */ }
    finally { setModalLoading(false); }
  }

  async function submitAssign() {
    if (!selectedCounselorId) return;
    setAssignLoading(true);
    const ok = await patch({ action: "assign_counselor", counselorId: selectedCounselorId });
    setAssignLoading(false);
    if (ok) setAssignOpen(false);
  }

  async function submitComplete() {
    setCompleteLoading(true);
    const ok = await patch({ action: "complete", ...completeFlags });
    setCompleteLoading(false);
    if (ok) setCompleteOpen(false);
  }

  async function saveMsdpNotes() {
    if (!followUp) return;
    setNotesLoading(true);
    await patch({ action: "note", notes: msdpNotes });
    setNotesLoading(false);
  }

  const currentIdx = followUp ? MSDP_STATUS_ORDER.indexOf(followUp.status) : -1;
  const isAbandoned = followUp?.status === "ABANDONED";
  const isCompleted = followUp?.status === "COMPLETED";

  return (
    <Card title="Suivi MSDP">
      {!followUp ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Aucun suivi MSDP démarré pour cette demande.</p>
          {isIntegrationMember && (
            <button
              onClick={create}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Création…" : "Démarrer le suivi MSDP"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status + conseiller */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${MSDP_STATUS_COLORS[followUp.status] ?? "bg-gray-100 text-gray-600"}`}>
              {MSDP_STATUS_LABELS[followUp.status] ?? followUp.status}
            </span>
            {followUp.assignedConseillerMsdp && (
              <span className="text-sm text-gray-600">
                Conseiller : <strong>{followUp.assignedConseillerMsdp.name ?? followUp.assignedConseillerMsdp.email}</strong>
              </span>
            )}
          </div>

          {/* Action buttons */}
          {canAct && (
            <div className="flex flex-wrap gap-2">
              {isIntegrationMember && (followUp.status === "SUBMITTED" || followUp.status === "ASSIGNED") && (
                <button
                  onClick={openAssignModal}
                  disabled={loading}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {followUp.status === "ASSIGNED" ? "Réaffecter conseiller" : "Assigner conseiller"}
                </button>
              )}
              {canAct && followUp.status === "ASSIGNED" && (
                <button
                  onClick={() => patch({ action: "contact" })}
                  disabled={loading}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Marquer contacté
                </button>
              )}
              {canAct && followUp.status === "CONTACTED" && (
                <button
                  onClick={() => patch({ action: "in_formation" })}
                  disabled={loading}
                  className="px-3 py-1.5 bg-purple-700 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  En formation PCNC
                </button>
              )}
              {canAct && followUp.status === "IN_FORMATION" && (
                <button
                  onClick={() => { setCompleteFlags({ integratedToFamily: false, isStar: false, followsPcnc: false }); setCompleteOpen(true); }}
                  disabled={loading}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Marquer terminé ✓
                </button>
              )}
              {isIntegrationMember && isAbandoned && (
                <button
                  onClick={() => patch({ action: "reopen" })}
                  disabled={loading}
                  className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Rouvrir
                </button>
              )}
              {canAct && !isCompleted && !isAbandoned && (
                <button
                  onClick={() => patch({ action: "abandon" })}
                  disabled={loading}
                  className="px-3 py-1.5 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Abandonner
                </button>
              )}
            </div>
          )}

          {/* Timeline */}
          {isAbandoned ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs">✕</span>
              Abandonné le {fmt(followUp.abandonedAt)}
            </div>
          ) : (
            <ol className="space-y-1.5">
              {MSDP_WORKFLOW_STEPS.map((step, i) => {
                const ts = followUp[step.tsKey as keyof MsdpFollowUpType] as Date | string | null;
                const done = i <= currentIdx;
                const current = MSDP_STATUS_ORDER[currentIdx] === step.status;
                return (
                  <li key={step.status} className="flex items-start gap-2">
                    <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      done ? (current ? "bg-purple-600 text-white" : "bg-emerald-100 text-emerald-700") : "bg-gray-100 text-gray-400"
                    }`}>
                      {done && !current ? "✓" : i + 1}
                    </span>
                    <div>
                      <p className={`text-sm ${done ? "text-gray-800 font-medium" : "text-gray-400"}`}>{step.label}</p>
                      {ts && <p className="text-xs text-gray-400">{fmtFull(ts)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Flags at completion */}
          {isCompleted && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-1 rounded-full border ${followUp.integratedToFamily ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                {followUp.integratedToFamily ? "✓" : "✗"} Intégré en famille
              </span>
              <span className={`px-2 py-1 rounded-full border ${followUp.isStar ? "bg-icc-violet/10 border-icc-violet/20 text-icc-violet" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                {followUp.isStar ? "✓" : "✗"} STAR
              </span>
              <span className={`px-2 py-1 rounded-full border ${followUp.followsPcnc ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                {followUp.followsPcnc ? "✓" : "✗"} Suit le PCNC
              </span>
            </div>
          )}

          {/* Notes */}
          {canAct && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Notes MSDP</label>
              <textarea
                value={msdpNotes}
                onChange={(e) => setMsdpNotes(e.target.value)}
                rows={3}
                placeholder="Notes du conseiller MSDP…"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveMsdpNotes}
                  disabled={notesLoading}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {notesLoading ? "Sauvegarde…" : "Enregistrer"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {/* Modal : Assigner conseiller */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assigner un conseiller MSDP">
        {modalLoading ? (
          <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conseiller MSDP</label>
              <select
                value={selectedCounselorId}
                onChange={(e) => setSelectedCounselorId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-icc-violet"
              >
                <option value="">Choisir un conseiller…</option>
                {counselors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.email}</option>
                ))}
              </select>
              {counselors.length === 0 && !modalLoading && (
                <p className="text-xs text-amber-600 mt-1">
                  Aucun conseiller MSDP trouvé. Assurez-vous que des membres sont rattachés au département MSDP.
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
              <button
                onClick={submitAssign}
                disabled={assignLoading || !selectedCounselorId}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {assignLoading ? "Enregistrement…" : "Assigner"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal : Terminer */}
      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Clôturer le suivi MSDP">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Indiquez l&apos;état du nouveau converti à la clôture du suivi.</p>
          {(["integratedToFamily", "isStar", "followsPcnc"] as const).map((key) => {
            const labels = { integratedToFamily: "Intégré dans une famille", isStar: "Devenu STAR (sert dans un département)", followsPcnc: "Suit le PCNC (Parcours Chrétien Nouveau Converti)" };
            return (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${completeFlags[key] ? "bg-purple-600 border-purple-600" : "border-gray-300"}`}>
                  {completeFlags[key] && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span className="text-sm text-gray-700">{labels[key]}</span>
                <input type="checkbox" checked={completeFlags[key]} onChange={(e) => setCompleteFlags((f) => ({ ...f, [key]: e.target.checked }))} className="sr-only" />
              </label>
            );
          })}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setCompleteOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button
              onClick={submitComplete}
              disabled={completeLoading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {completeLoading ? "Enregistrement…" : "Clôturer"}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
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

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: initial.firstName,
    lastName: initial.lastName,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    address: initial.address ?? "",
    ageRange: initial.ageRange,
    churchStatus: initial.churchStatus,
  });
  const [editLoading, setEditLoading] = useState(false);

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

  async function submitEdit() {
    setEditLoading(true);
    const ok = await patch({ action: "edit", ...editForm });
    setEditLoading(false);
    if (ok) setEditOpen(false);
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

  const isIntegrationMember = !isScoped;
  const isAssignedBerger = req.assignedBerger?.id === currentUserId;
  const canActAsBerger = isIntegrationMember || isAssignedBerger;

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
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[req.status] ?? req.status}
          </span>
          {canActAsBerger && req.status !== "INTEGRATED" && req.status !== "ABANDONED" && (
            <button
              onClick={() => {
                setEditForm({
                  firstName: req.firstName,
                  lastName: req.lastName,
                  phone: req.phone ?? "",
                  email: req.email ?? "",
                  address: req.address ?? "",
                  ageRange: req.ageRange,
                  churchStatus: req.churchStatus,
                });
                setEditOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Actions workflow */}
      {canActAsBerger && (
        <div className="space-y-2">
          {/* Bandeau contextuel pour le berger */}
          {isAssignedBerger && !isIntegrationMember && (
            <div className="flex items-center gap-2 text-xs text-icc-violet bg-icc-violet/5 border border-icc-violet/20 rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Vous êtes le berger assigné à cette demande.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {/* Actions membres intégration uniquement */}
            {isIntegrationMember && (req.status === "SUBMITTED" || req.status === "ASSIGNED") && (
              <button
                onClick={openAssignModal}
                disabled={loading}
                className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {req.status === "ASSIGNED" ? "Réaffecter" : "Assigner"}
              </button>
            )}
            {isIntegrationMember && req.status === "ABANDONED" && (
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
          <Row label="Appel au salut" value={req.salvationCall ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              Oui
            </span>
          ) : "Non"} />
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

      {/* Suivi MSDP */}
      {req.salvationCall && (
        <MsdpSection
          initialFollowUp={req.msdpFollowUp}
          requestId={req.id}
          churchId={churchId}
          isIntegrationMember={isIntegrationMember}
          currentUserId={currentUserId}
        />
      )}

      {/* Notes internes */}
      {canActAsBerger && (
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

      {/* Modal : Modifier */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier la demande">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={editForm.lastName}
                onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
            <input
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adresse</label>
            <input
              type="text"
              value={editForm.address}
              onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Tranche d&apos;âge</label>
            <div className="flex flex-wrap gap-2">
              {(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"] as const).map((v) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${editForm.ageRange === v ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"}`}>
                  <input type="radio" name="editAgeRange" value={v} checked={editForm.ageRange === v} onChange={() => setEditForm((f) => ({ ...f, ageRange: v }))} className="sr-only" />
                  {AGE_LABELS[v]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Situation à l&apos;église</label>
            <div className="flex flex-wrap gap-2">
              {(["VISITOR", "REGULAR", "ENGAGED"] as const).map((v) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${editForm.churchStatus === v ? "bg-icc-violet text-white border-icc-violet" : "border-gray-200 text-gray-700 hover:border-icc-violet"}`}>
                  <input type="radio" name="editChurchStatus" value={v} checked={editForm.churchStatus === v} onChange={() => setEditForm((f) => ({ ...f, churchStatus: v }))} className="sr-only" />
                  {CHURCH_STATUS_LABELS[v]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button
              onClick={submitEdit}
              disabled={editLoading || !editForm.firstName || !editForm.lastName}
              className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {editLoading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
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
