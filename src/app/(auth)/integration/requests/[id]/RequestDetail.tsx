"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";

// ── Labels ────────────────────────────────────────────────────────────────────

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
  YOUTH:        "Jeune (−18 ans)",
  YOUNG_ADULT:  "Jeune adulte (18–30 ans)",
  ADULT:        "Adulte (30–60 ans)",
  SENIOR:       "Senior (60+ ans)",
};

const CHURCH_STATUS_LABELS: Record<string, string> = {
  VISITOR: "Visiteur — je découvre",
  REGULAR: "Régulier — je viens souvent",
  ENGAGED: "Engagé — je sers",
};


const MSDP_STATUS_LABELS: Record<string, string> = {
  SUBMITTED:    "Appel reçu",
  ASSIGNED:     "Conseiller assigné",
  CONTACTED:    "Premier contact établi",
  IN_FORMATION: "En formation",
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


// ── Milestones ─────────────────────────────────────────────────────────────────

const MILESTONES = [
  { key: "integratedInFamily" as const, label: "Famille",    tsKey: "familyIntegratedAt" as const },
  { key: "followsPcnc"        as const, label: "PCNC",       tsKey: "pcncStartedAt"      as const },
  { key: "isStar"             as const, label: "Service",    tsKey: "starSince"           as const },
  { key: "inDiscipleship"     as const, label: "Discipolat", tsKey: "discipleshipSince"   as const },
] as const;

type MilestoneKey = (typeof MILESTONES)[number]["key"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonJourneyData {
  id: string;
  integratedInFamily: boolean;
  familyIntegratedAt: Date | string | null;
  followsPcnc: boolean;
  pcncStartedAt: Date | string | null;
  isStar: boolean;
  starSince: Date | string | null;
  inDiscipleship: boolean;
  discipleshipSince: Date | string | null;
}

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
  personJourney: PersonJourneyData | null;
}

interface Family { id: number; name: string; }
interface Leader {
  id: string;
  userId: string;
  familyId: number;
  role: string;
  user: { id: string; name: string | null; email: string | null };
}

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

function fmtShort(d: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}


// ── Timeline ──────────────────────────────────────────────────────────────────

interface StepData {
  label: string;
  done: boolean;
  current: boolean;
  ts: Date | string | null;
}

const TRACK_THEME = {
  violet: {
    circleCurrent: "bg-icc-violet text-white ring-2 ring-icc-violet/20",
    circleDone:    "bg-icc-violet/15 text-icc-violet",
    circlePending: "bg-gray-100 text-gray-400",
    lineActive:    "bg-icc-violet",
    linePending:   "bg-gray-200",
    dotActive:     "bg-icc-violet",
    dotDone:       "bg-icc-violet/35",
    dotPending:    "bg-gray-200",
  },
  purple: {
    circleCurrent: "bg-purple-600 text-white ring-2 ring-purple-200",
    circleDone:    "bg-purple-100 text-purple-700",
    circlePending: "bg-gray-100 text-gray-400",
    lineActive:    "bg-purple-500",
    linePending:   "bg-gray-200",
    dotActive:     "bg-purple-600",
    dotDone:       "bg-purple-200",
    dotPending:    "bg-gray-200",
  },
} as const;

function TrackTimeline({ steps, theme = "violet" }: { steps: StepData[]; theme?: keyof typeof TRACK_THEME }) {
  const t = TRACK_THEME[theme];
  return (
    <>
      {/* Desktop: frise horizontale complète */}
      <div className="hidden sm:flex items-start">
        {steps.map((step, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div
                className={`flex-1 h-0.5 self-start mt-[9px] ${
                  steps[i - 1].done ? t.lineActive : t.linePending
                }`}
              />
            )}
            <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
              <div
                className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step.current ? t.circleCurrent : step.done ? t.circleDone : t.circlePending
                }`}
              >
                {step.done && !step.current ? "✓" : i + 1}
              </div>
              <p
                className={`text-[11px] text-center mt-1 leading-snug max-w-[52px] ${
                  step.done ? "text-gray-700 font-medium" : "text-gray-400"
                }`}
              >
                {step.label}
              </p>
              {step.ts && (
                <p className="text-[10px] text-gray-400 mt-0.5 text-center">{fmtShort(step.ts)}</p>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Mobile: ligne compacte */}
      <div className="sm:hidden flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${
                step.current ? t.dotActive : step.done ? t.dotDone : t.dotPending
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-600">
          {steps.find((s) => s.current)?.label ??
            (steps.every((s) => s.done)
              ? "Terminé ✓"
              : steps.filter((s) => s.done).at(-1)?.label ?? "—")}
        </span>
      </div>
    </>
  );
}

// ── Milestone chips ───────────────────────────────────────────────────────────

function MilestoneChips({
  journey,
  canToggle,
  onToggle,
}: {
  journey: PersonJourneyData | null;
  canToggle: boolean;
  onToggle: (key: MilestoneKey, currentValue: boolean) => void;
}) {
  if (!journey) {
    return (
      <div className="flex flex-wrap gap-2">
        {MILESTONES.map((m) => (
          <span
            key={m.key}
            className="px-3 py-1.5 rounded-full border border-dashed border-gray-200 text-xs text-gray-300"
          >
            {m.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {MILESTONES.map((m) => {
        const done = journey[m.key];
        const ts = journey[m.tsKey];
        const base = done
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : "bg-gray-50 text-gray-400 border-gray-200";
        const interactive =
          canToggle && !done
            ? "hover:border-icc-violet hover:text-icc-violet cursor-pointer"
            : canToggle && done
            ? "hover:bg-emerald-200 cursor-pointer"
            : "cursor-default";

        return (
          <button
            key={m.key}
            type="button"
            disabled={!canToggle}
            onClick={canToggle ? () => onToggle(m.key, done) : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${base} ${interactive}`}
          >
            {done ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            {m.label}
            {done && ts && (
              <span className="font-normal text-emerald-600 ml-0.5">{fmtShort(ts)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── MSDP actions (tab content) ────────────────────────────────────────────────

interface MsdpActionsProps {
  followUp: MsdpFollowUpType | null;
  onFollowUpChange: (f: MsdpFollowUpType) => void;
  requestId: string;
  churchId: string;
  canAct: boolean;
  hideStatus?: boolean;
}

function MsdpActions({ followUp, onFollowUpChange, requestId, churchId, canAct, hideStatus = false }: MsdpActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msdpNotes, setMsdpNotes] = useState(followUp?.notes ?? "");
  const [notesLoading, setNotesLoading] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{
    action: string;
    label: string;
    description: string;
    variant?: "danger";
  } | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [counselors, setCounselors] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [selectedCounselorId, setSelectedCounselorId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);

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
      onFollowUpChange(json);
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
    const ok = await patch({ action: "complete" });
    setCompleteLoading(false);
    if (ok) setCompleteOpen(false);
  }

  async function saveMsdpNotes() {
    if (!followUp) return;
    setNotesLoading(true);
    await patch({ action: "note", notes: msdpNotes });
    setNotesLoading(false);
  }

  const isCounselor = followUp?.assignedConseillerMsdpId !== undefined;
  const isAbandoned = followUp?.status === "ABANDONED";
  const isCompleted = followUp?.status === "COMPLETED";

  if (!followUp) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Aucun suivi MSDP démarré.</p>
        {canAct && (
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/integration/msdp", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ requestId, churchId }),
                });
                const json = await res.json();
                if (!res.ok) { setError(json.error ?? "Erreur"); return; }
                onFollowUpChange(json);
              } catch { setError("Erreur réseau"); }
              finally { setLoading(false); }
            }}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Création…" : "Démarrer le suivi MSDP"}
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideStatus && (
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
      )}
      {hideStatus && followUp.assignedConseillerMsdp && (
        <p className="text-xs text-gray-500">
          Conseiller : <strong className="text-gray-700">{followUp.assignedConseillerMsdp.name ?? followUp.assignedConseillerMsdp.email}</strong>
        </p>
      )}

      {/* Actions */}
      {canAct && (
        <div className="flex flex-wrap gap-2">
          {(followUp.status === "SUBMITTED" || followUp.status === "ASSIGNED") && (
            <button onClick={openAssignModal} disabled={loading}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {followUp.status === "ASSIGNED" ? "Réaffecter conseiller" : "Assigner conseiller"}
            </button>
          )}
          {(followUp.status === "ASSIGNED" || isCounselor) && followUp.status === "ASSIGNED" && (
            <button
              onClick={() => setPendingTransition({
                action: "contact",
                label: "Marquer contacté",
                description: "Confirmer que le premier contact a été établi avec la personne ?",
              })}
              disabled={loading}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Marquer contacté
            </button>
          )}
          {followUp.status === "CONTACTED" && (
            <button
              onClick={() => setPendingTransition({
                action: "in_formation",
                label: "Passer en formation",
                description: "Confirmer que la personne est maintenant en formation MSDP ?",
              })}
              disabled={loading}
              className="px-3 py-1.5 bg-purple-700 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              En formation
            </button>
          )}
          {followUp.status === "IN_FORMATION" && (
            <button onClick={() => setCompleteOpen(true)} disabled={loading}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              Marquer terminé ✓
            </button>
          )}
          {isAbandoned && (
            <button
              onClick={() => setPendingTransition({
                action: "reopen",
                label: "Rouvrir le suivi MSDP",
                description: "Rouvrir ce suivi MSDP et le repasser en cours ?",
              })}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Rouvrir
            </button>
          )}
          {!isCompleted && !isAbandoned && (
            <button
              onClick={() => setPendingTransition({
                action: "abandon",
                label: "Abandonner le suivi MSDP",
                description: "Marquer ce suivi MSDP comme abandonné ? Il pourra être rouvert si nécessaire.",
                variant: "danger",
              })}
              disabled={loading}
              className="px-3 py-1.5 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Abandonner
            </button>
          )}
        </div>
      )}

      {/* Notes MSDP */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">Notes MSDP</label>
        {canAct ? (
          <>
            <textarea
              value={msdpNotes}
              onChange={(e) => setMsdpNotes(e.target.value)}
              rows={4}
              placeholder="Notes du conseiller MSDP…"
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
            />
            <div className="flex justify-end">
              <button onClick={saveMsdpNotes} disabled={notesLoading}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {notesLoading ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600">{followUp.notes || <span className="text-gray-300 italic">Aucune note</span>}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
              {counselors.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Aucun conseiller MSDP trouvé. Assurez-vous que des membres sont rattachés au département MSDP.
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
              <button onClick={submitAssign} disabled={assignLoading || !selectedCounselorId}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                {assignLoading ? "Enregistrement…" : "Assigner"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Clôturer le suivi MSDP">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Le suivi MSDP sera marqué comme terminé. Les jalons du parcours peuvent être mis à jour
            directement sur cette fiche ou depuis la section <strong>Parcours</strong>.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setCompleteOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={submitComplete} disabled={completeLoading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {completeLoading ? "Enregistrement…" : "Clôturer"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pendingTransition !== null}
        onClose={() => setPendingTransition(null)}
        title={pendingTransition?.label ?? ""}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{pendingTransition?.description}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPendingTransition(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={async () => {
                if (!pendingTransition) return;
                setTransitionLoading(true);
                await patch({ action: pendingTransition.action });
                setTransitionLoading(false);
                setPendingTransition(null);
              }}
              disabled={transitionLoading}
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity ${
                pendingTransition?.variant === "danger" ? "bg-red-600" : "bg-purple-600"
              }`}
            >
              {transitionLoading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type TabId = "contact" | "profil" | "famille" | "notes";

export default function RequestDetail({ request: initial, churchId, isScoped, currentUserId }: Props) {
  const router = useRouter();
  const [req, setReq] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [notesLoading, setNotesLoading] = useState(false);
  const [msdpFollowUp, setMsdpFollowUp] = useState(initial.msdpFollowUp);
  const [activeTab, setActiveTab] = useState<TabId>("contact");

  // Confirmation modale transitions workflow
  const [pendingTransition, setPendingTransition] = useState<{
    action: string;
    label: string;
    description: string;
    variant?: "danger";
  } | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  // PersonJourney state
  const [journey, setJourney] = useState<PersonJourneyData | null>(initial.personJourney ?? null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);

  // Milestone toggle modal
  const [milestoneModal, setMilestoneModal] = useState<{
    key: MilestoneKey;
    label: string;
    currentValue: boolean;
  } | null>(null);
  const [milestoneLoading, setMilestoneLoading] = useState(false);

  // Assign modal
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

  // ── API helpers ──────────────────────────────────────────────────────────────

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

  async function createJourney() {
    setJourneyLoading(true);
    setJourneyError(null);
    try {
      const res = await fetch("/api/integration/parcours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          firstName: req.firstName,
          lastName: req.lastName,
          phone: req.phone ?? undefined,
          email: req.email ?? undefined,
          sourceRequestId: req.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setJourneyError(json.error ?? "Erreur"); return; }
      setJourney(json);
    } catch { setJourneyError("Erreur réseau"); }
    finally { setJourneyLoading(false); }
  }

  async function confirmMilestoneToggle() {
    if (!milestoneModal || !journey) return;
    setMilestoneLoading(true);
    try {
      const res = await fetch(`/api/integration/parcours/${journey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [milestoneModal.key]: !milestoneModal.currentValue }),
      });
      const json = await res.json();
      if (!res.ok) return;
      setJourney(json);
    } catch { /* silent */ }
    finally {
      setMilestoneLoading(false);
      setMilestoneModal(null);
    }
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
      const loadedFamilies: Family[] = famJson.families ?? [];
      setFamilies(loadedFamilies);
      setLeaders(leadJson ?? []);
      // Pré-sélectionner la famille suggérée si aucune famille n'est encore assignée
      if (!req.assignedFamilyId && req.suggestedFamilyName) {
        const suggested = loadedFamilies.find(
          (f) => f.name.toLowerCase() === req.suggestedFamilyName!.toLowerCase()
        );
        if (suggested) setAssignFamilyId(suggested.id.toString());
      }
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
    await fetch(`/api/integration/requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", notes }),
    });
    setNotesLoading(false);
  }

  // ── Role helpers ─────────────────────────────────────────────────────────────

  const isIntegrationMember = !isScoped;
  const isAssignedBerger = req.assignedBerger?.id === currentUserId;
  const canActAsBerger = isIntegrationMember || isAssignedBerger;
  const isAbandoned = req.status === "ABANDONED";

  // ── Timeline steps ───────────────────────────────────────────────────────────

  const integrationSteps: StepData[] = [
    { label: "Soumise",     done: true,                                                                    current: req.status === "SUBMITTED",      ts: req.submittedAt },
    { label: "Assignée",    done: ["ASSIGNED","CONTACTED","WHATSAPP_ADDED","INTEGRATED"].includes(req.status), current: req.status === "ASSIGNED",   ts: req.assignedAt },
    { label: "Contacté·e",  done: ["CONTACTED","WHATSAPP_ADDED","INTEGRATED"].includes(req.status),        current: req.status === "CONTACTED",      ts: req.contactedAt },
    { label: "WhatsApp",    done: ["WHATSAPP_ADDED","INTEGRATED"].includes(req.status),                    current: req.status === "WHATSAPP_ADDED", ts: req.whatsappAddedAt },
    { label: "Intégré·e",   done: req.status === "INTEGRATED",                                            current: req.status === "INTEGRATED",     ts: req.integratedAt },
  ];

  const msdpSteps: StepData[] | null = msdpFollowUp ? [
    { label: "Reçu",       done: true,                                                                             current: msdpFollowUp.status === "SUBMITTED",    ts: msdpFollowUp.createdAt },
    { label: "Conseiller", done: ["ASSIGNED","CONTACTED","IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status), current: msdpFollowUp.status === "ASSIGNED",    ts: msdpFollowUp.assignedAt },
    { label: "Contact",    done: ["CONTACTED","IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status),           current: msdpFollowUp.status === "CONTACTED",    ts: msdpFollowUp.contactedAt },
    { label: "Formation",  done: ["IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status),                       current: msdpFollowUp.status === "IN_FORMATION", ts: msdpFollowUp.inFormationAt },
    { label: "Terminé",    done: msdpFollowUp.status === "COMPLETED",                                              current: msdpFollowUp.status === "COMPLETED",    ts: msdpFollowUp.completedAt },
  ] : null;

  // ── Tabs config ──────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = [
    { id: "contact", label: "Contact" },
    { id: "profil",  label: "Profil" },
    { id: "famille", label: "Famille" },
    { id: "notes",   label: "Notes" },
  ];

  const filteredLeaders = assignFamilyId
    ? leaders.filter((l) => l.familyId === parseInt(assignFamilyId))
    : leaders;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-white rounded-xl border border-gray-200 p-4 md:p-5">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-gray-900">{req.firstName} {req.lastName}</h1>
          <p className="text-sm text-gray-400">{fmt(req.submittedAt)}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {req.salvationCall && (
              <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                Appel au salut
              </span>
            )}
            {req.pastoralCareRequested && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                Soin pastoral
              </span>
            )}
          </div>
          {journey && (
            <a href="/integration/parcours" className="inline-flex items-center gap-1 text-xs text-icc-violet hover:underline mt-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Voir le dossier parcours
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 self-start">
          {canActAsBerger && req.status !== "INTEGRATED" && req.status !== "ABANDONED" && (
            <button
              onClick={() => {
                setEditForm({
                  firstName: req.firstName, lastName: req.lastName,
                  phone: req.phone ?? "", email: req.email ?? "",
                  address: req.address ?? "", ageRange: req.ageRange, churchStatus: req.churchStatus,
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

      {/* ── Card 1 : Intégration famille ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Intégration famille</h2>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[req.status] ?? req.status}
          </span>
        </div>

        {isAbandoned ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold">✕</span>
              Abandonné{req.abandonedAt ? ` le ${fmt(req.abandonedAt)}` : ""}
            </div>
            {req.abandonReason && (
              <p className="text-xs text-gray-400 pl-7">{req.abandonReason}</p>
            )}
          </div>
        ) : (
          <TrackTimeline steps={integrationSteps} theme="violet" />
        )}

        {(req.assignedFamilyName || req.assignedBerger?.name) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 pt-2 border-t border-gray-100">
            {req.assignedFamilyName && (
              <span>Famille&nbsp;: <strong className="text-gray-700">{req.assignedFamilyName}</strong></span>
            )}
            {req.assignedBerger?.name && (
              <span>Berger&nbsp;: <strong className="text-gray-700">{req.assignedBerger.name}</strong></span>
            )}
          </div>
        )}

        {canActAsBerger && (
          <div className="space-y-2 pt-1">
            {isAssignedBerger && !isIntegrationMember && (
              <div className="flex items-center gap-2 text-xs text-icc-violet bg-icc-violet/5 border border-icc-violet/20 rounded-lg px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Vous êtes le berger assigné à cette demande.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {isIntegrationMember && (req.status === "SUBMITTED" || req.status === "ASSIGNED") && (
                <button onClick={openAssignModal} disabled={loading}
                  className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {req.status === "ASSIGNED" ? "Réaffecter" : "Assigner"}
                </button>
              )}
              {isIntegrationMember && req.status === "ABANDONED" && (
                <button
                  onClick={() => setPendingTransition({
                    action: "reopen",
                    label: "Rouvrir la demande",
                    description: `Rouvrir la demande de ${req.firstName} ${req.lastName} ? Elle repassera en statut "En attente".`,
                  })}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Rouvrir
                </button>
              )}
              {canActAsBerger && req.status === "ASSIGNED" && (
                <button
                  onClick={() => setPendingTransition({
                    action: "contact",
                    label: "Marquer contacté·e",
                    description: `Confirmer que ${req.firstName} ${req.lastName} a été contacté·e ?`,
                  })}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Marquer contacté
                </button>
              )}
              {canActAsBerger && req.status === "CONTACTED" && (
                <button
                  onClick={() => setPendingTransition({
                    action: "whatsapp",
                    label: "Ajouté dans le groupe WhatsApp",
                    description: `Confirmer que ${req.firstName} ${req.lastName} a été ajouté·e dans le groupe WhatsApp famille ?`,
                  })}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Ajouté dans le groupe WhatsApp
                </button>
              )}
              {canActAsBerger && req.status === "WHATSAPP_ADDED" && (
                <button
                  onClick={() => setPendingTransition({
                    action: "integrate",
                    label: "Marquer intégré·e",
                    description: `Confirmer l'intégration de ${req.firstName} ${req.lastName} dans la famille ? Cette étape est définitive.`,
                  })}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Marquer intégré ✓
                </button>
              )}
              {canActAsBerger && req.status !== "INTEGRATED" && req.status !== "ABANDONED" && (
                <button onClick={() => setAbandonOpen(true)} disabled={loading}
                  className="px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                  Abandonner
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Card 2 : Appel au salut — MSDP ── */}
      {req.salvationCall && (
        <div className="bg-white rounded-xl border border-purple-100 p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              <h2 className="text-sm font-semibold text-gray-700">Appel au salut — MSDP</h2>
            </div>
            {msdpFollowUp && (
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${MSDP_STATUS_COLORS[msdpFollowUp.status] ?? "bg-gray-100 text-gray-600"}`}>
                {MSDP_STATUS_LABELS[msdpFollowUp.status] ?? msdpFollowUp.status}
              </span>
            )}
          </div>

          {msdpSteps && (
            msdpFollowUp?.status === "ABANDONED" ? (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold">✕</span>
                Abandonné{msdpFollowUp.abandonedAt ? ` le ${fmt(msdpFollowUp.abandonedAt)}` : ""}
              </div>
            ) : (
              <TrackTimeline steps={msdpSteps} theme="purple" />
            )
          )}

          <MsdpActions
            followUp={msdpFollowUp}
            onFollowUpChange={setMsdpFollowUp}
            requestId={req.id}
            churchId={churchId}
            canAct={isIntegrationMember || msdpFollowUp?.assignedConseillerMsdpId === currentUserId}
            hideStatus
          />
        </div>
      )}

      {/* ── Card 3 : Étapes clés du parcours ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Étapes clés du parcours</h2>
          {journey && (
            <a href="/integration/parcours" className="text-xs text-icc-violet hover:underline">
              Dossier complet →
            </a>
          )}
        </div>
        <MilestoneChips
          journey={journey}
          canToggle={isIntegrationMember && journey !== null}
          onToggle={(key, currentValue) => {
            const milestone = MILESTONES.find((m) => m.key === key)!;
            setMilestoneModal({ key, label: milestone.label, currentValue });
          }}
        />
        {!journey && isIntegrationMember && (
          <div className="flex items-center gap-2">
            <button
              onClick={createJourney}
              disabled={journeyLoading}
              className="text-xs text-icc-violet hover:underline disabled:opacity-50"
            >
              {journeyLoading ? "Création…" : "+ Créer le dossier parcours"}
            </button>
            {journeyError && <span className="text-xs text-red-500">{journeyError}</span>}
          </div>
        )}
      </div>

      {/* ── Onglets ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-icc-violet text-icc-violet"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4 md:p-5">

          {/* Contact */}
          {activeTab === "contact" && (
            <div className="space-y-3">
              {req.phone ? (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Téléphone</span>
                  <a href={`tel:${req.phone}`} className="text-sm text-icc-violet hover:underline">{req.phone}</a>
                </div>
              ) : null}
              {req.email ? (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Email</span>
                  <a href={`mailto:${req.email}`} className="text-sm text-icc-violet hover:underline">{req.email}</a>
                </div>
              ) : null}
              {req.address && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Adresse</span>
                  <span className="text-sm text-gray-800">{req.address}</span>
                </div>
              )}
              {req.member && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Membre Koinonia</span>
                  <span className="text-sm text-gray-800">{req.member.firstName} {req.member.lastName}</span>
                </div>
              )}
              {!req.phone && !req.email && !req.address && !req.member && (
                <p className="text-sm text-gray-400 italic">Aucune information de contact renseignée.</p>
              )}
            </div>
          )}

          {/* Profil */}
          {activeTab === "profil" && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Tranche d'âge</span>
                <span className="text-sm text-gray-800">{AGE_LABELS[req.ageRange] ?? req.ageRange}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Situation</span>
                <span className="text-sm text-gray-800">{CHURCH_STATUS_LABELS[req.churchStatus] ?? req.churchStatus}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Appel au salut</span>
                <span className="text-sm text-gray-800">
                  {req.salvationCall ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />Oui
                    </span>
                  ) : "Non"}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Soin pastoral</span>
                <span className="text-sm text-gray-800">
                  {req.pastoralCareRequested ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      Demandé
                      {req.appointmentRequest && (
                        <span className="text-xs text-gray-400 ml-1">({req.appointmentRequest.status})</span>
                      )}
                    </span>
                  ) : "Non"}
                </span>
              </div>
            </div>
          )}

          {/* Famille */}
          {activeTab === "famille" && (
            <div className="space-y-3">
              {req.suggestedFamilyName && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Suggestion géo</span>
                  <span className="text-sm text-gray-500 italic">{req.suggestedFamilyName}</span>
                </div>
              )}
              {req.lat && req.lng && (
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                  <span className="text-xs text-gray-400 sm:w-28 shrink-0">Carte familles</span>
                  <a
                    href={`https://familles.iccrennes.fr/carte?lat=${req.lat}&lng=${req.lng}&label=${encodeURIComponent(req.address ?? `${req.lat}, ${req.lng}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-icc-violet hover:underline"
                  >
                    Voir sur la carte familles ↗
                  </a>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Famille assignée</span>
                <span className="text-sm font-medium text-icc-violet">
                  {req.assignedFamilyName ?? <span className="text-gray-300 font-normal">—</span>}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
                <span className="text-xs text-gray-400 sm:w-28 shrink-0">Berger</span>
                <span className="text-sm text-gray-800">
                  {req.assignedBerger?.name ?? <span className="text-gray-300">—</span>}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          {activeTab === "notes" && (
            <div className="space-y-3">
              {canActAsBerger ? (
                <>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Notes visibles uniquement par l'équipe intégration…"
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet resize-none"
                  />
                  <div className="flex justify-end">
                    <button onClick={saveNotes} disabled={notesLoading}
                      className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                      {notesLoading ? "Sauvegarde…" : "Enregistrer les notes"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">{req.notes || <span className="italic text-gray-300">Aucune note</span>}</p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modals ── */}

      {/* Confirmation transition workflow */}
      <Modal
        open={pendingTransition !== null}
        onClose={() => setPendingTransition(null)}
        title={pendingTransition?.label ?? ""}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{pendingTransition?.description}</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setPendingTransition(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              onClick={async () => {
                if (!pendingTransition) return;
                setTransitionLoading(true);
                await patch({ action: pendingTransition.action });
                setTransitionLoading(false);
                setPendingTransition(null);
              }}
              disabled={transitionLoading}
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity ${
                pendingTransition?.variant === "danger" ? "bg-red-600" : "bg-icc-violet"
              }`}
            >
              {transitionLoading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Milestone toggle */}
      <Modal
        open={milestoneModal !== null}
        onClose={() => setMilestoneModal(null)}
        title={milestoneModal?.currentValue ? "Désactiver le jalon" : "Activer le jalon"}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {milestoneModal?.currentValue
              ? `Désactiver le jalon "${milestoneModal.label}" pour ${req.firstName} ${req.lastName} ?`
              : `Activer le jalon "${milestoneModal?.label}" pour ${req.firstName} ${req.lastName} ?`}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setMilestoneModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={confirmMilestoneToggle}
              disabled={milestoneLoading}
              className={`px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity ${
                milestoneModal?.currentValue ? "bg-gray-500" : "bg-emerald-600"
              }`}
            >
              {milestoneLoading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assigner famille/berger */}
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
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
              <button onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
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

      {/* Modifier */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier la demande">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Prénom</label>
              <input type="text" value={editForm.firstName}
                onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
              <input type="text" value={editForm.lastName}
                onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
            <input type="tel" value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adresse</label>
            <input type="text" value={editForm.address}
              onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet" />
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
            <button onClick={submitEdit} disabled={editLoading || !editForm.firstName || !editForm.lastName}
              className="px-4 py-2 bg-icc-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {editLoading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Abandonner */}
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
            <button onClick={() => setAbandonOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button onClick={submitAbandon} disabled={abandonLoading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {abandonLoading ? "Abandon…" : "Confirmer l'abandon"}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
