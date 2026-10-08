"use client";

import { Fragment, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import HistoryTimeline from "@/components/HistoryTimeline";

type DateLike = Date | string;

const HISTORY_ACTION_LABELS: Record<string, string> = {
  relance: "Relance consignée",
  handback: "Renvoyée à l'intégration",
};

// ── Labels ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED:      "Demande reçue",
  WAITING_RECONTACT: "Attente de recontact",
  WAITING_MISSION:   "Attente département mission",
  ASSIGNED:       "Assigné",
  CONTACTED:      "Contacté",
  WHATSAPP_ADDED: "Ajouté dans le groupe WhatsApp famille",
  INTEGRATED:     "Intégré",
  ABANDONED:      "Abandonné",
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:      "bg-warning-soft text-warning",
  WAITING_RECONTACT: "bg-warning-soft text-warning",
  WAITING_MISSION:   "bg-warning-soft text-warning",
  ASSIGNED:       "bg-info-soft text-info",
  CONTACTED:      "bg-info-soft text-info",
  WHATSAPP_ADDED: "bg-success-soft text-success",
  INTEGRATED:     "bg-success-soft text-success",
  ABANDONED:      "bg-danger-soft text-danger",
};

// Motifs d'abandon (spec 051) — miroir client de ABANDON_REASON_LABELS du module intégration.
const ABANDON_REASON_OPTIONS = [
  ["UNKNOWN_NUMBER", "Numéro inconnu ou erroné"],
  ["UNREACHABLE", "Injoignable après relances"],
  ["NO_LONGER_INTERESTED", "Ne souhaite plus être contacté·e"],
  ["OTHER_CHURCH", "A rejoint une autre église"],
  ["MOVED", "A déménagé"],
  ["DUPLICATE", "Doublon"],
  ["OTHER", "Autre"],
] as const;
const ABANDON_REASON_LABELS: Record<string, string> = Object.fromEntries(ABANDON_REASON_OPTIONS);

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
  ASSIGNED:     "Référent assigné",
  CONTACTED:    "Premier contact établi",
  IN_FORMATION: "En formation",
  COMPLETED:    "Terminé",
  ABANDONED:    "Abandonné",
};

const MSDP_STATUS_COLORS: Record<string, string> = {
  SUBMITTED:    "bg-warning-soft text-warning",
  ASSIGNED:     "bg-info-soft text-info",
  CONTACTED:    "bg-info-soft text-info",
  IN_FORMATION: "bg-brand-soft text-brand-text",
  COMPLETED:    "bg-success-soft text-success",
  ABANDONED:    "bg-danger-soft text-danger",
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
  familyIntegratedAt: DateLike | null;
  followsPcnc: boolean;
  pcncStartedAt: DateLike | null;
  isStar: boolean;
  starSince: DateLike | null;
  inDiscipleship: boolean;
  discipleshipSince: DateLike | null;
}

interface MsdpFollowUpType {
  id: string;
  status: string;
  assignedConseillerMsdpId: string | null;
  assignedConseillerMsdp: { id: string; name: string | null; email: string | null } | null;
  assignedProfile: { id: string; name: string } | null;
  assignedAt: DateLike | null;
  contactedAt: DateLike | null;
  inFormationAt: DateLike | null;
  completedAt: DateLike | null;
  abandonedAt: DateLike | null;
  notes: string | null;
  createdAt: DateLike;
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
  submittedAt: DateLike;
  assignedAt: DateLike | null;
  contactedAt: DateLike | null;
  whatsappAddedAt: DateLike | null;
  integratedAt: DateLike | null;
  abandonedAt: DateLike | null;
  abandonReason: string | null;
  abandonReasonCode: string | null;
  waitingFrom: string | null;
  waitingSince: DateLike | null;
  lastRelanceAt: DateLike | null;
  suggestedFamilyName: string | null;
  assignedFamilyId: number | null;
  assignedFamilyName: string | null;
  assignedBerger: { id: string; name: string | null; email: string | null } | null;
  member: { id: string; firstName: string; lastName: string } | null;
  pastoralCareRequested: boolean;
  salvationCall: boolean;
  notes: string | null;
  lat: number | null;
  lng: number | null;
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
  readonly request: Request;
  /** Rendez-vous pastoral et suivi MSDP nés de cette demande — propriété de `care` (spec 052),
   *  orchestrés côté page plutôt qu'inclus dans `request` (aucun import entre modules). */
  readonly appointmentRequest: { id: string; status: string } | null;
  readonly msdpFollowUp: MsdpFollowUpType | null;
  readonly churchId: string;
  readonly isScoped: boolean;
  readonly currentUserId: string;
  /** Échéance de relance dépassée à l'ouverture de la fiche (spec 051). */
  readonly relanceDue: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: DateLike | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtShort(d: DateLike | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}


// ── Timeline ──────────────────────────────────────────────────────────────────

interface StepData {
  label: string;
  done: boolean;
  current: boolean;
  ts: DateLike | null;
}

const TRACK_THEME = {
  violet: {
    circleCurrent: "bg-brand text-on-brand ring-2 ring-focus/20",
    circleDone:    "bg-brand/15 text-brand-text",
    circlePending: "bg-surface-sunken text-ink-subtle",
    lineActive:    "bg-brand",
    linePending:   "bg-surface-sunken",
    dotActive:     "bg-brand",
    dotDone:       "bg-brand/35",
    dotPending:    "bg-surface-sunken",
  },
  purple: {
    circleCurrent: "bg-brand text-on-brand ring-2 ring-focus",
    circleDone:    "bg-brand-soft text-brand-text",
    circlePending: "bg-surface-sunken text-ink-subtle",
    lineActive:    "bg-brand",
    linePending:   "bg-surface-sunken",
    dotActive:     "bg-brand",
    dotDone:       "bg-brand/35",
    dotPending:    "bg-surface-sunken",
  },
} as const;

function stepTone(step: { done: boolean; current: boolean }, current: string, done: string, pending: string): string {
  if (step.current) return current;
  if (step.done) return done;
  return pending;
}

function resumeHint(waitingFrom: string | null): string {
  if (waitingFrom === "CONTACTED") return "La demande reprendra à l'ajout au groupe de la famille.";
  if (waitingFrom === "ASSIGNED") return "La demande reprendra au premier contact.";
  return "La demande reprendra à l'affectation d'une famille.";
}

function milestoneInteractiveClass(canToggle: boolean, done: boolean): string {
  if (canToggle && !done) return "hover:border-brand hover:text-brand-text cursor-pointer";
  if (canToggle && done) return "hover:bg-success/20 cursor-pointer";
  return "cursor-default";
}

function TrackTimeline({ steps, theme = "violet" }: { readonly steps: StepData[]; readonly theme?: keyof typeof TRACK_THEME }) {
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
                  stepTone(step, t.circleCurrent, t.circleDone, t.circlePending)
                }`}
              >
                {step.done && !step.current ? "✓" : i + 1}
              </div>
              <p
                className={`text-[11px] text-center mt-1 leading-snug max-w-[52px] ${
                  step.done ? "text-ink-muted font-medium" : "text-ink-subtle"
                }`}
              >
                {step.label}
              </p>
              {step.ts && (
                <p className="text-[10px] text-ink-subtle mt-0.5 text-center">{fmtShort(step.ts)}</p>
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
                stepTone(step, t.dotActive, t.dotDone, t.dotPending)
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-ink-muted">
          {steps.find((s) => s.current)?.label ??
            (steps.every((s) => s.done)
              ? "Terminé ✓"
              : steps.findLast((s) => s.done)?.label ?? "—")}
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
  readonly journey: PersonJourneyData | null;
  readonly canToggle: boolean;
  readonly onToggle: (key: MilestoneKey, currentValue: boolean) => void;
}) {
  if (!journey) {
    return (
      <div className="flex flex-wrap gap-2">
        {MILESTONES.map((m) => (
          <span
            key={m.key}
            className="px-3 py-1.5 rounded-full border border-dashed border-line text-xs text-ink-subtle"
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
          ? "bg-success-soft text-success border-success/30"
          : "bg-surface-sunken text-ink-subtle border-line";
        const interactive = milestoneInteractiveClass(canToggle, done);

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
              <span className="font-normal text-success ml-0.5">{fmtShort(ts)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── MSDP summary (tab content) ──────────────────────────────────────────────
// Résumé + lien vers /care/followups/[id] (spec 052, lot 2) : les actions de suivi (assigner,
// contacter, clôturer…) vivent désormais uniquement sur la fiche care, seule à connaître la
// machine à états à jour (deux populations d'accompagnants, motifs qualifiés) — pas de
// duplication de logique ici.

interface MsdpActionsProps {
  readonly followUp: MsdpFollowUpType | null;
  readonly onFollowUpChange: (f: MsdpFollowUpType) => void;
  readonly requestId: string;
  readonly churchId: string;
  readonly canAct: boolean;
  readonly hideStatus?: boolean;
}

function MsdpActions({ followUp, onFollowUpChange, requestId, churchId, canAct, hideStatus = false }: MsdpActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!followUp) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Aucun suivi MSDP démarré.</p>
        {canAct && (
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/care/followups", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ integrationRequestId: requestId, churchId }),
                });
                const json = await res.json();
                if (!res.ok) { setError(json.error ?? "Erreur"); return; }
                onFollowUpChange(json);
              } catch { setError("Erreur réseau"); }
              finally { setLoading(false); }
            }}
            disabled={loading}
            className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Création…" : "Démarrer le suivi MSDP"}
          </button>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const assigneeName = followUp.assignedConseillerMsdp?.name ?? followUp.assignedConseillerMsdp?.email
    ?? followUp.assignedProfile?.name ?? null;

  return (
    <div className="space-y-3">
      {!hideStatus && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${MSDP_STATUS_COLORS[followUp.status] ?? "bg-surface-sunken text-ink-muted"}`}>
            {MSDP_STATUS_LABELS[followUp.status] ?? followUp.status}
          </span>
          {assigneeName && (
            <span className="text-sm text-ink-muted">Référent : <strong>{assigneeName}</strong></span>
          )}
        </div>
      )}
      {hideStatus && assigneeName && (
        <p className="text-xs text-ink-muted">
          Référent : <strong className="text-ink-muted">{assigneeName}</strong>
        </p>
      )}
      {followUp.notes && (
        <p className="text-sm text-ink-muted whitespace-pre-line">{followUp.notes}</p>
      )}
      <a
        href={`/care/followups/${followUp.id}`}
        className="inline-block text-sm font-medium text-brand-text hover:underline"
      >
        Voir et gérer le suivi →
      </a>
    </div>
  );
}

/** Droits de l'appelant sur la demande et étape affichée dans la frise (spec 051). */
function requestPermissions(req: Request, isScoped: boolean, currentUserId: string) {
  const isIntegrationMember = !isScoped;
  const isAssignedBerger = req.assignedBerger?.id === currentUserId;
  const canActAsBerger = isIntegrationMember || isAssignedBerger;
  const isAbandoned = req.status === "ABANDONED";
  const isWaiting = req.status === "WAITING_RECONTACT" || req.status === "WAITING_MISSION";
  // Poser une attente : équipe seule depuis « demande reçue », berger ou équipe depuis
  // « premier contact établi ». Lever/relancer : même règle, calculée sur le point d'entrée.
  // Poser une attente : équipe seule depuis « demande reçue », berger ou équipe depuis
  // « famille affectée » / « premier contact établi ». Lever/relancer : même règle, calculée sur
  // le point d'entrée. Le département mission reste une décision de l'équipe (spec 051).
  const isBergerStage = req.status === "ASSIGNED" || req.status === "CONTACTED";
  const canWaitRecontact =
    (req.status === "SUBMITTED" && isIntegrationMember) || (isBergerStage && canActAsBerger);
  const canSendToMission = isIntegrationMember && (req.status === "SUBMITTED" || isBergerStage);
  const canLiftWait =
    isWaiting &&
    (req.waitingFrom === "ASSIGNED" || req.waitingFrom === "CONTACTED" ? canActAsBerger : isIntegrationMember);
  // Renvoi à l'équipe : action du berger en charge ; l'équipe, elle, réaffecte directement.
  const canHandback = isBergerStage && isAssignedBerger;
  // Pendant une attente, la frise reste positionnée sur l'étape d'où l'on vient.
  const trackStatus = isWaiting && req.waitingFrom ? req.waitingFrom : req.status;
  const isOpen = req.status !== "INTEGRATED" && req.status !== "ABANDONED";
  return {
    canAssign: isIntegrationMember && (req.status === "SUBMITTED" || req.status === "ASSIGNED"),
    canReopen: isIntegrationMember && req.status === "ABANDONED",
    // Modifier la fiche ou l'abandonner : tant que la demande est en cours
    canEditOrAbandon: canActAsBerger && isOpen,
    isIntegrationMember,
    isAssignedBerger,
    canActAsBerger,
    isAbandoned,
    isWaiting,
    canWaitRecontact,
    canSendToMission,
    canLiftWait,
    canHandback,
    trackStatus,
  };
}

/** Frise d'intégration famille, positionnée sur l'étape courante (ou d'origine d'une attente). */
function integrationStepsFor(req: Request, trackStatus: string): StepData[] {
  return [
    { label: "Soumise",     done: true,                                                                    current: trackStatus === "SUBMITTED",      ts: req.submittedAt },
    { label: "Assignée",    done: ["ASSIGNED","CONTACTED","WHATSAPP_ADDED","INTEGRATED"].includes(trackStatus), current: trackStatus === "ASSIGNED",   ts: req.assignedAt },
    { label: "Contacté·e",  done: ["CONTACTED","WHATSAPP_ADDED","INTEGRATED"].includes(trackStatus),        current: trackStatus === "CONTACTED",      ts: req.contactedAt },
    { label: "WhatsApp",    done: ["WHATSAPP_ADDED","INTEGRATED"].includes(trackStatus),                    current: trackStatus === "WHATSAPP_ADDED", ts: req.whatsappAddedAt },
    { label: "Intégré·e",   done: trackStatus === "INTEGRATED",                                            current: trackStatus === "INTEGRATED",     ts: req.integratedAt },
  ];
}

/** Frise du suivi MSDP (nouveaux convertis). */
function msdpStepsFor(msdpFollowUp: MsdpFollowUpType): StepData[] {
  return [
    { label: "Reçu",       done: true,                                                                             current: msdpFollowUp.status === "SUBMITTED",    ts: msdpFollowUp.createdAt },
    { label: "Référent",   done: ["ASSIGNED","CONTACTED","IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status), current: msdpFollowUp.status === "ASSIGNED",    ts: msdpFollowUp.assignedAt },
    { label: "Contact",    done: ["CONTACTED","IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status),           current: msdpFollowUp.status === "CONTACTED",    ts: msdpFollowUp.contactedAt },
    { label: "Formation",  done: ["IN_FORMATION","COMPLETED"].includes(msdpFollowUp.status),                       current: msdpFollowUp.status === "IN_FORMATION", ts: msdpFollowUp.inFormationAt },
    { label: "Terminé",    done: msdpFollowUp.status === "COMPLETED",                                              current: msdpFollowUp.status === "COMPLETED",    ts: msdpFollowUp.completedAt },
  ];
}

/** En-tête : identité, date, appel au salut / soin pastoral, lien parcours, modification. */
function RequestHeader({
  req,
  hasJourney,
  canEdit,
  onEdit,
}: {
  readonly req: Request;
  readonly hasJourney: boolean;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 bg-surface rounded-xl border border-line p-4 md:p-5">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-ink">{req.firstName} {req.lastName}</h1>
        <p className="text-sm text-ink-subtle">{fmt(req.submittedAt)}</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {req.salvationCall && (
            <span className="text-xs text-brand-text bg-brand-soft px-2 py-0.5 rounded-full border border-brand/30">
              Appel au salut
            </span>
          )}
          {req.pastoralCareRequested && (
            <span className="text-xs text-warning bg-warning-soft px-2 py-0.5 rounded-full border border-warning/30">
              Soin pastoral
            </span>
          )}
        </div>
        {hasJourney && (
          <a href="/integration/parcours" className="inline-flex items-center gap-1 text-xs text-brand-text hover:underline mt-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Voir le dossier parcours
          </a>
        )}
      </div>
      <div className="flex items-center gap-2 self-start">
        {canEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line rounded-lg text-ink-muted hover:bg-surface-sunken transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modifier
          </button>
        )}
      </div>
    </div>
  );
}

/** Avancement de l'intégration : frise ou abandon, attente en cours, famille et berger. */
function IntegrationProgress({
  req,
  steps,
  isAbandoned,
  isWaiting,
  relanceDue,
}: {
  readonly req: Request;
  readonly steps: StepData[];
  readonly isAbandoned: boolean;
  readonly isWaiting: boolean;
  readonly relanceDue: boolean;
}) {
  return (
    <>
      {isAbandoned ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-danger">
            <span className="w-5 h-5 rounded-full bg-danger-soft flex items-center justify-center text-xs font-bold">✕</span>
            Abandonné{req.abandonedAt ? ` le ${fmt(req.abandonedAt)}` : ""}
          </div>
          {req.abandonReasonCode && (
            <p className="text-xs text-ink-muted pl-7">
              Motif&nbsp;: {ABANDON_REASON_LABELS[req.abandonReasonCode] ?? req.abandonReasonCode}
            </p>
          )}
          {req.abandonReason && (
            <p className="text-xs text-ink-subtle pl-7">{req.abandonReason}</p>
          )}
        </div>
      ) : (
        <TrackTimeline steps={steps} theme="violet" />
      )}

      {isWaiting && (
        <div className="text-xs bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 space-y-0.5">
          <p className="text-warning font-medium">
            {req.status === "WAITING_MISSION"
              ? "En attente de la décision du département mission"
              : "En attente de recontact"}
            {req.waitingSince ? ` depuis le ${fmt(req.waitingSince)}` : ""}
          </p>
          {req.lastRelanceAt && (
            <p className="text-warning">Dernière relance consignée le {fmt(req.lastRelanceAt)}</p>
          )}
          {relanceDue && (
            <p className="text-warning font-semibold">
              À relancer : {req.status === "WAITING_MISSION" ? "le département mission" : "la personne"}
            </p>
          )}
        </div>
      )}

      {(req.assignedFamilyName || req.assignedBerger?.name) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted pt-2 border-t border-line">
          {req.assignedFamilyName && (
            <span>Famille&nbsp;: <strong className="text-ink-muted">{req.assignedFamilyName}</strong></span>
          )}
          {req.assignedBerger?.name && (
            <span>Berger&nbsp;: <strong className="text-ink-muted">{req.assignedBerger.name}</strong></span>
          )}
        </div>
      )}
    </>
  );
}

/** Étape suivante proposée au berger selon le statut, avec sa confirmation. */
const NEXT_TRANSITION: Record<string, { action: string; label: string; button: string; description: (req: Request) => string }> = {
  ASSIGNED: {
    action: "contact",
    label: "Marquer contacté·e",
    button: "Marquer contacté",
    description: (req) => `Confirmer que ${req.firstName} ${req.lastName} a été contacté·e ?`,
  },
  CONTACTED: {
    action: "whatsapp",
    label: "Ajouté dans le groupe WhatsApp",
    button: "Ajouté dans le groupe WhatsApp",
    description: (req) => `Confirmer que ${req.firstName} ${req.lastName} a été ajouté·e dans le groupe WhatsApp famille ?`,
  },
  WHATSAPP_ADDED: {
    action: "integrate",
    label: "Marquer intégré·e",
    button: "Marquer intégré ✓",
    description: (req) => `Confirmer l'intégration de ${req.firstName} ${req.lastName} dans la famille ? Cette étape est définitive.`,
  },
};

type TransitionRequest = { action: string; label: string; description: string; variant?: "danger" };

/** Actions disponibles sur la demande, selon les droits de l'appelant. */
function IntegrationActions({
  req,
  loading,
  showBergerNotice,
  canAssign,
  canReopen,
  canActAsBerger,
  canLiftWait,
  canWaitRecontact,
  canSendToMission,
  canHandback,
  canAbandon,
  onAssign,
  onReopen,
  onTransition,
  onRelance,
  onWait,
  onHandback,
  onAbandon,
}: {
  readonly req: Request;
  readonly loading: boolean;
  readonly showBergerNotice: boolean;
  readonly canAssign: boolean;
  readonly canReopen: boolean;
  readonly canActAsBerger: boolean;
  readonly canLiftWait: boolean;
  readonly canWaitRecontact: boolean;
  readonly canSendToMission: boolean;
  readonly canHandback: boolean;
  readonly canAbandon: boolean;
  readonly onAssign: () => void;
  readonly onReopen: () => void;
  readonly onTransition: (t: TransitionRequest) => void;
  readonly onRelance: () => void;
  readonly onWait: (kind: "RECONTACT" | "MISSION") => void;
  readonly onHandback: () => void;
  readonly onAbandon: () => void;
}) {
  const transition = canActAsBerger ? NEXT_TRANSITION[req.status] : undefined;
  return (
    <div className="space-y-2 pt-1">
      {showBergerNotice && (
        <div className="flex items-center gap-2 text-xs text-brand-text bg-brand-soft border border-brand/20 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Vous êtes le berger assigné à cette demande.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canAssign && (
          <button onClick={onAssign} disabled={loading}
            className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {req.status === "ASSIGNED" ? "Réaffecter" : "Assigner"}
          </button>
        )}
        {canReopen && (
          <button
            onClick={onReopen}
            disabled={loading}
            className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Rouvrir
          </button>
        )}
        {transition && (
          <button
            onClick={() => onTransition({
              action: transition.action,
              label: transition.label,
              description: transition.description(req),
            })}
            disabled={loading}
            className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {transition.button}
          </button>
        )}
        {canLiftWait && (
          <>
            <button
              onClick={onRelance}
              disabled={loading}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              J&apos;ai relancé
            </button>
            <button
              onClick={() => onTransition({
                action: "resume",
                label: "Reprendre le suivi",
                description: `Reprendre le suivi de ${req.firstName} ${req.lastName} ? ${resumeHint(req.waitingFrom)}`,
              })}
              disabled={loading}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Reprendre le suivi
            </button>
          </>
        )}
        {canWaitRecontact && (
          <button onClick={() => onWait("RECONTACT")} disabled={loading}
            className="px-4 py-2 bg-surface text-warning border border-warning/30 text-sm font-medium rounded-lg hover:bg-warning-soft disabled:opacity-50 transition-colors">
            À recontacter plus tard
          </button>
        )}
        {canSendToMission && (
          <button onClick={() => onWait("MISSION")} disabled={loading}
            className="px-4 py-2 bg-surface text-warning border border-warning/30 text-sm font-medium rounded-lg hover:bg-warning-soft disabled:opacity-50 transition-colors">
            Transmettre au département mission
          </button>
        )}
        {canHandback && (
          <button onClick={onHandback} disabled={loading}
            className="px-4 py-2 bg-surface text-ink-muted border border-control-line text-sm font-medium rounded-lg hover:bg-surface-sunken disabled:opacity-50 transition-colors">
            Renvoyer à l&apos;intégration
          </button>
        )}
        {canAbandon && (
          <button onClick={onAbandon} disabled={loading}
            className="px-4 py-2 bg-surface text-danger border border-danger/30 text-sm font-medium rounded-lg hover:bg-danger-soft disabled:opacity-50 transition-colors">
            Abandonner
          </button>
        )}
      </div>
    </div>
  );
}

/** Onglet « Contact » de la fiche. */
function ContactTab({ req }: { readonly req: Request }) {
  return (
    <div className="space-y-3">
      {req.phone ? (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Téléphone</span>
          <a href={`tel:${req.phone}`} className="text-sm text-brand-text hover:underline">{req.phone}</a>
        </div>
      ) : null}
      {req.email ? (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Email</span>
          <a href={`mailto:${req.email}`} className="text-sm text-brand-text hover:underline">{req.email}</a>
        </div>
      ) : null}
      {req.address && (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Adresse</span>
          <span className="text-sm text-ink">{req.address}</span>
        </div>
      )}
      {req.member && (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Membre Koinonia</span>
          <span className="text-sm text-ink">{req.member.firstName} {req.member.lastName}</span>
        </div>
      )}
      {!req.phone && !req.email && !req.address && !req.member && (
        <p className="text-sm text-ink-subtle italic">Aucune information de contact renseignée.</p>
      )}
    </div>
  );
}

/** Onglet « Profil » de la fiche. */
function ProfileTab({ req, appointmentRequest }: { readonly req: Request; readonly appointmentRequest: Props["appointmentRequest"] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Tranche d&apos;âge</span>
        <span className="text-sm text-ink">{AGE_LABELS[req.ageRange] ?? req.ageRange}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Situation</span>
        <span className="text-sm text-ink">{CHURCH_STATUS_LABELS[req.churchStatus] ?? req.churchStatus}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Appel au salut</span>
        <span className="text-sm text-ink">
          {req.salvationCall ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand shrink-0" />Oui
            </span>
          ) : "Non"}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Soin pastoral</span>
        <span className="text-sm text-ink">
          {req.pastoralCareRequested ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
              Demandé
              {appointmentRequest && (
                <span className="text-xs text-ink-subtle ml-1">({appointmentRequest.status})</span>
              )}
            </span>
          ) : "Non"}
        </span>
      </div>
    </div>
  );
}

/** Onglet « Famille » de la fiche. */
function FamilyTab({ req }: { readonly req: Request }) {
  return (
    <div className="space-y-3">
      {req.suggestedFamilyName && (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Suggestion géo</span>
          <span className="text-sm text-ink-muted italic">{req.suggestedFamilyName}</span>
        </div>
      )}
      {req.lat && req.lng && (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
          <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Carte familles</span>
          <a
            href={`https://familles.iccrennes.fr/carte?lat=${req.lat}&lng=${req.lng}&label=${encodeURIComponent(req.address ?? [req.lat, req.lng].join(", "))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-brand-text hover:underline"
          >
            Voir sur la carte familles ↗
          </a>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Famille assignée</span>
        <span className="text-sm font-medium text-brand-text">
          {req.assignedFamilyName ?? <span className="text-ink-subtle font-normal">—</span>}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
        <span className="text-xs text-ink-subtle sm:w-28 shrink-0">Berger</span>
        <span className="text-sm text-ink">
          {req.assignedBerger?.name ?? <span className="text-ink-subtle">—</span>}
        </span>
      </div>
    </div>
  );
}

/** Onglet « Notes » : modifiable par l'équipe et le berger, en lecture seule sinon. */
function NotesTab({
  canEdit,
  notes,
  savedNotes,
  saving,
  onNotesChange,
  onSave,
}: {
  readonly canEdit: boolean;
  readonly notes: string;
  readonly savedNotes: string | null;
  readonly saving: boolean;
  readonly onNotesChange: (value: string) => void;
  readonly onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={5}
            placeholder="Notes visibles uniquement par l'équipe intégration…"
            className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
          />
          <div className="flex justify-end">
            <button onClick={onSave} disabled={saving}
              className="px-4 py-1.5 bg-surface-sunken hover:bg-surface-sunken text-ink-muted text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? "Sauvegarde…" : "Enregistrer les notes"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{savedNotes || <span className="italic text-ink-subtle">Aucune note</span>}</p>
      )}
    </div>
  );
}

/** Confirmation d'activation ou de désactivation d'un jalon du parcours. */
function MilestoneConfirmModal({
  milestone,
  personName,
  loading,
  onClose,
  onConfirm,
}: {
  readonly milestone: { key: MilestoneKey; label: string; currentValue: boolean } | null;
  readonly personName: string;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      open={milestone !== null}
      onClose={onClose}
      title={milestone?.currentValue ? "Désactiver le jalon" : "Activer le jalon"}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          {milestone?.currentValue
            ? `Désactiver le jalon "${milestone.label}" pour ${personName} ?`
            : `Activer le jalon "${milestone?.label}" pour ${personName} ?`}
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity ${
              milestone?.currentValue
                ? "border border-control-line text-ink hover:bg-surface-sunken"
                : "bg-brand text-on-brand"
            }`}
          >
            {loading ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Confirmation d'une étape du workflow d'intégration. */
function TransitionConfirmModal({
  transition,
  loading,
  onClose,
  onConfirm,
}: {
  readonly transition: TransitionRequest | null;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal
      open={transition !== null}
      onClose={onClose}
      title={transition?.label ?? ""}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{transition?.description}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity ${
              transition?.variant === "danger" ? "bg-danger text-on-danger" : "bg-brand text-on-brand"
            }`}
          >
            {loading ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Avancement du suivi MSDP : frise, ou abandon daté. */
function MsdpProgress({ steps, followUp }: { readonly steps: StepData[]; readonly followUp: MsdpFollowUpType | null }) {
  return (
    followUp?.status === "ABANDONED" ? (
      <div className="flex items-center gap-2 text-sm text-danger">
        <span className="w-5 h-5 rounded-full bg-danger-soft flex items-center justify-center text-xs font-bold">✕</span>
        Abandonné{followUp.abandonedAt ? ` le ${fmt(followUp.abandonedAt)}` : ""}
      </div>
    ) : (
      <TrackTimeline steps={steps} theme="purple" />
    )
  );
}

/** Étapes clés du parcours : jalons (modifiables par l'équipe) ou création du dossier. */
function JourneyCard({
  journey,
  isIntegrationMember,
  creating,
  error,
  onCreate,
  onToggleMilestone,
}: {
  readonly journey: PersonJourneyData | null;
  readonly isIntegrationMember: boolean;
  readonly creating: boolean;
  readonly error: string | null;
  readonly onCreate: () => void;
  readonly onToggleMilestone: (key: MilestoneKey, currentValue: boolean) => void;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-muted">Étapes clés du parcours</h2>
        {journey && (
          <a href="/integration/parcours" className="text-xs text-brand-text hover:underline">
            Dossier complet →
          </a>
        )}
      </div>
      <MilestoneChips
        journey={journey}
        canToggle={isIntegrationMember && journey !== null}
        onToggle={onToggleMilestone}
      />
      {!journey && isIntegrationMember && (
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            disabled={creating}
            className="text-xs text-brand-text hover:underline disabled:opacity-50"
          >
            {creating ? "Création…" : "+ Créer le dossier parcours"}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type TabId = "contact" | "profil" | "famille" | "notes";

export default function RequestDetail({ request: initial, appointmentRequest, msdpFollowUp: initialMsdpFollowUp, churchId, isScoped, currentUserId, relanceDue: initialRelanceDue }: Props) {
  const router = useRouter();
  const uid = useId();
  const [req, setReq] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [notesLoading, setNotesLoading] = useState(false);
  const [msdpFollowUp, setMsdpFollowUp] = useState(initialMsdpFollowUp);
  const [activeTab, setActiveTab] = useState<TabId>("contact");

  // Confirmation modale transitions workflow
  const [pendingTransition, setPendingTransition] = useState<{
    action: string;
    label: string;
    description: string;
    variant?: "danger";
  } | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  // États d'attente, relances, réouverture et historique (spec 051)
  const [historyKey, setHistoryKey] = useState(0);
  const [relanceDue, setRelanceDue] = useState(initialRelanceDue);
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitKind, setWaitKind] = useState<"RECONTACT" | "MISSION">("RECONTACT");
  const [waitNote, setWaitNote] = useState("");
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relanceNote, setRelanceNote] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [handbackOpen, setHandbackOpen] = useState(false);
  const [handbackReason, setHandbackReason] = useState("");
  const [abandonReasonCode, setAbandonReasonCode] = useState<string>("");
  const [dialogLoading, setDialogLoading] = useState(false);

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
      if (json.status !== "WAITING_RECONTACT" && json.status !== "WAITING_MISSION") setRelanceDue(false);
      setHistoryKey((k) => k + 1);
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
    const family = families.find((f) => f.id === Number.parseInt(assignFamilyId));
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
    if (!abandonReasonCode) return;
    const ok = await patch({ action: "abandon", abandonReasonCode, abandonReason: abandonReason || undefined });
    setAbandonLoading(false);
    if (ok) { setAbandonOpen(false); setAbandonReason(""); setAbandonReasonCode(""); }
  }

  async function submitWait() {
    setDialogLoading(true);
    const ok = await patch({ action: "wait", waitingKind: waitKind, note: waitNote || undefined });
    setDialogLoading(false);
    if (ok) { setWaitOpen(false); setWaitNote(""); setRelanceDue(false); }
  }

  async function submitHandback() {
    if (!handbackReason.trim()) return;
    setDialogLoading(true);
    const ok = await patch({ action: "handback", reason: handbackReason.trim() });
    setDialogLoading(false);
    // Le berger n'est plus en charge : retour à sa liste plutôt qu'une fiche qui ne le concerne plus.
    if (ok) { setHandbackOpen(false); setHandbackReason(""); router.push("/integration/requests"); }
  }

  async function submitRelance() {
    setDialogLoading(true);
    const ok = await patch({ action: "relance", note: relanceNote || undefined });
    setDialogLoading(false);
    if (ok) { setRelanceOpen(false); setRelanceNote(""); setRelanceDue(false); }
  }

  async function submitReopen(mode: "resume" | "restart") {
    setDialogLoading(true);
    const ok = await patch({ action: "reopen", mode });
    setDialogLoading(false);
    if (ok) setReopenOpen(false);
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

  const {
    canAssign,
    canReopen,
    canEditOrAbandon,
    isIntegrationMember,
    isAssignedBerger,
    canActAsBerger,
    isAbandoned,
    isWaiting,
    canWaitRecontact,
    canSendToMission,
    canLiftWait,
    canHandback,
    trackStatus,
  } = requestPermissions(req, isScoped, currentUserId);

  // ── Timeline steps ───────────────────────────────────────────────────────────

  const integrationSteps = integrationStepsFor(req, trackStatus);
  const msdpSteps = msdpFollowUp ? msdpStepsFor(msdpFollowUp) : null;

  // ── Tabs config ──────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string }[] = [
    { id: "contact", label: "Contact" },
    { id: "profil",  label: "Profil" },
    { id: "famille", label: "Famille" },
    { id: "notes",   label: "Notes" },
  ];

  const filteredLeaders = assignFamilyId
    ? leaders.filter((l) => l.familyId === Number.parseInt(assignFamilyId))
    : leaders;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">

      {/* ── Header ── */}
      <RequestHeader
        req={req}
        hasJourney={Boolean(journey)}
        canEdit={canEditOrAbandon}
        onEdit={() => {
          setEditForm({
            firstName: req.firstName, lastName: req.lastName,
            phone: req.phone ?? "", email: req.email ?? "",
            address: req.address ?? "", ageRange: req.ageRange, churchStatus: req.churchStatus,
          });
          setEditOpen(true);
        }}
      />

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* ── Card 1 : Intégration famille ── */}
      <div className="bg-surface rounded-xl border border-line p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">Intégration famille</h2>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] ?? "bg-surface-sunken text-ink-muted"}`}>
            {STATUS_LABELS[req.status] ?? req.status}
          </span>
        </div>

        <IntegrationProgress req={req} steps={integrationSteps} isAbandoned={isAbandoned} isWaiting={isWaiting} relanceDue={relanceDue} />

        {canActAsBerger && (
          <IntegrationActions
            req={req}
            loading={loading}
            showBergerNotice={isAssignedBerger && !isIntegrationMember}
            canAssign={canAssign}
            canReopen={canReopen}
            canActAsBerger={canActAsBerger}
            canLiftWait={canLiftWait}
            canWaitRecontact={canWaitRecontact}
            canSendToMission={canSendToMission}
            canHandback={canHandback}
            canAbandon={canEditOrAbandon}
            onAssign={openAssignModal}
            onReopen={() => setReopenOpen(true)}
            onTransition={setPendingTransition}
            onRelance={() => setRelanceOpen(true)}
            onWait={(kind) => { setWaitKind(kind); setWaitOpen(true); }}
            onHandback={() => setHandbackOpen(true)}
            onAbandon={() => setAbandonOpen(true)}
          />
        )}
      </div>

      <HistoryTimeline
        fetchUrl={`/api/integration/requests/${req.id}/history`}
        statusLabels={STATUS_LABELS}
        actionLabels={HISTORY_ACTION_LABELS}
        refreshKey={historyKey}
        title="Historique des statuts"
      />

      {/* ── Card 2 : Suivi MSDP — démarrable même sans appel au salut (#550) ── */}
      <div className="bg-surface rounded-xl border border-brand/30 p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
            <h2 className="text-sm font-semibold text-ink-muted">{req.salvationCall ? "Appel au salut — MSDP" : "Suivi MSDP"}</h2>
          </div>
          {msdpFollowUp && (
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${MSDP_STATUS_COLORS[msdpFollowUp.status] ?? "bg-surface-sunken text-ink-muted"}`}>
              {MSDP_STATUS_LABELS[msdpFollowUp.status] ?? msdpFollowUp.status}
            </span>
          )}
        </div>

        {msdpSteps && <MsdpProgress steps={msdpSteps} followUp={msdpFollowUp} />}

        <MsdpActions
          followUp={msdpFollowUp}
          onFollowUpChange={setMsdpFollowUp}
          requestId={req.id}
          churchId={churchId}
          canAct={isIntegrationMember || msdpFollowUp?.assignedConseillerMsdpId === currentUserId}
          hideStatus
        />
      </div>

      {/* ── Card 3 : Étapes clés du parcours ── */}
      <JourneyCard
        journey={journey}
        isIntegrationMember={isIntegrationMember}
        creating={journeyLoading}
        error={journeyError}
        onCreate={createJourney}
        onToggleMilestone={(key, currentValue) => {
          const milestone = MILESTONES.find((m) => m.key === key)!;
          setMilestoneModal({ key, label: milestone.label, currentValue });
        }}
      />

      {/* ── Onglets ── */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-line overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-brand text-brand-text"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4 md:p-5">

          {/* Contact */}
          {activeTab === "contact" && <ContactTab req={req} />}

          {/* Profil */}
          {activeTab === "profil" && <ProfileTab req={req} appointmentRequest={appointmentRequest} />}

          {/* Famille */}
          {activeTab === "famille" && <FamilyTab req={req} />}

          {/* Notes */}
          {activeTab === "notes" && (
            <NotesTab
              canEdit={canActAsBerger}
              notes={notes}
              savedNotes={req.notes}
              saving={notesLoading}
              onNotesChange={setNotes}
              onSave={saveNotes}
            />
          )}

        </div>
      </div>

      {/* ── Modals ── */}

      {/* Confirmation transition workflow */}
      <TransitionConfirmModal
        transition={pendingTransition}
        loading={transitionLoading}
        onClose={() => setPendingTransition(null)}
        onConfirm={async () => {
          if (!pendingTransition) return;
          setTransitionLoading(true);
          await patch({ action: pendingTransition.action });
          setTransitionLoading(false);
          setPendingTransition(null);
        }}
      />

      {/* Milestone toggle */}
      <MilestoneConfirmModal
        milestone={milestoneModal}
        personName={`${req.firstName} ${req.lastName}`}
        loading={milestoneLoading}
        onClose={() => setMilestoneModal(null)}
        onConfirm={confirmMilestoneToggle}
      />

      {/* Assigner famille/berger */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assigner la demande">
        {modalLoading ? (
          <p className="text-sm text-ink-subtle text-center py-6">Chargement…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor={`${uid}-assign-family`} className="block text-sm font-medium text-ink-muted mb-1">Famille</label>
              <select
                id={`${uid}-assign-family`}
                value={assignFamilyId}
                onChange={(e) => { setAssignFamilyId(e.target.value); setAssignBergerId(""); }}
                className="w-full border border-control-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand"
              >
                <option value="">Choisir une famille…</option>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {req.suggestedFamilyName && (
                <p className="text-xs text-ink-subtle mt-1">Suggestion géo : {req.suggestedFamilyName}</p>
              )}
            </div>
            <div>
              <label htmlFor={`${uid}-assign-berger`} className="block text-sm font-medium text-ink-muted mb-1">Berger / co-berger</label>
              <select
                id={`${uid}-assign-berger`}
                value={assignBergerId}
                onChange={(e) => setAssignBergerId(e.target.value)}
                className="w-full border border-control-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand"
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
                <p className="text-xs text-warning mt-1">
                  Aucun berger configuré pour cette famille.{" "}
                  <a href="/integration/leaders" className="underline">Configurer →</a>
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
              <button
                onClick={submitAssign}
                disabled={assignLoading || !assignFamilyId || !assignBergerId}
                className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
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
              <label htmlFor={`${uid}-edit-first`} className="block text-xs font-medium text-ink-muted mb-1">Prénom</label>
              <input id={`${uid}-edit-first`} type="text" value={editForm.firstName}
                onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label htmlFor={`${uid}-edit-last`} className="block text-xs font-medium text-ink-muted mb-1">Nom</label>
              <input id={`${uid}-edit-last`} type="text" value={editForm.lastName}
                onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-edit-phone`} className="block text-xs font-medium text-ink-muted mb-1">Téléphone</label>
            <input id={`${uid}-edit-phone`} type="tel" value={editForm.phone}
              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label htmlFor={`${uid}-edit-email`} className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input id={`${uid}-edit-email`} type="email" value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label htmlFor={`${uid}-edit-address`} className="block text-xs font-medium text-ink-muted mb-1">Adresse</label>
            <input id={`${uid}-edit-address`} type="text" value={editForm.address}
              onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
          </div>
          <fieldset className="min-w-0">
            <legend className="block text-xs font-medium text-ink-muted mb-2">Tranche d&apos;âge</legend>
            <div className="flex flex-wrap gap-2">
              {(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"] as const).map((v) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${editForm.ageRange === v ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"}`}>
                  <input type="radio" name="editAgeRange" value={v} checked={editForm.ageRange === v} onChange={() => setEditForm((f) => ({ ...f, ageRange: v }))} className="sr-only" />
                  {AGE_LABELS[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="block text-xs font-medium text-ink-muted mb-2">Situation à l&apos;église</legend>
            <div className="flex flex-wrap gap-2">
              {(["VISITOR", "REGULAR", "ENGAGED"] as const).map((v) => (
                <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${editForm.churchStatus === v ? "bg-brand text-on-brand border-brand" : "border-line text-ink-muted hover:border-brand"}`}>
                  <input type="radio" name="editChurchStatus" value={v} checked={editForm.churchStatus === v} onChange={() => setEditForm((f) => ({ ...f, churchStatus: v }))} className="sr-only" />
                  {CHURCH_STATUS_LABELS[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={submitEdit} disabled={editLoading || !editForm.firstName || !editForm.lastName}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {editLoading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Abandonner */}
      <Modal open={abandonOpen} onClose={() => setAbandonOpen(false)} title="Abandonner la demande">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Cette demande sera marquée comme abandonnée. Elle pourra être rouverte si nécessaire.
          </p>
          <fieldset className="space-y-1.5">
            <legend className="block text-sm font-medium text-ink-muted mb-1">
              Motif <span className="text-danger">*</span>
            </legend>
            {ABANDON_REASON_OPTIONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                <input
                  type="radio"
                  name="abandonReasonCode"
                  value={value}
                  checked={abandonReasonCode === value}
                  onChange={() => setAbandonReasonCode(value)}
                  className="accent-brand"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor={`${uid}-abandon-reason`} className="block text-sm font-medium text-ink-muted mb-1">Commentaire (facultatif)</label>
            <textarea
              id={`${uid}-abandon-reason`}
              value={abandonReason}
              onChange={(e) => setAbandonReason(e.target.value)}
              rows={3}
              placeholder="Ex : sans nouvelles après 3 relances…"
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAbandonOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={submitAbandon} disabled={abandonLoading || !abandonReasonCode}
              className="px-4 py-2 bg-danger text-on-danger text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {abandonLoading ? "Abandon…" : "Confirmer l'abandon"}
            </button>
          </div>
        </div>
      </Modal>

      {/* À recontacter plus tard / Transmettre au département mission (spec 051) */}
      <Modal
        open={waitOpen}
        onClose={() => setWaitOpen(false)}
        title={waitKind === "MISSION" ? "Transmettre au département mission" : "À recontacter plus tard"}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {waitKind === "MISSION"
              ? "L'adresse ne correspond à aucune famille d'impact : la décision revient au département mission."
              : `${req.firstName} ${req.lastName} souhaite être recontacté·e plus tard, ou n'a pas pu être joint·e pour l'instant.`}{" "}
            La demande sort de la file à traiter ; une alerte de relance sera émise à l&apos;équipe
            intégration une fois le délai écoulé.
          </p>
          <div>
            <label htmlFor={`${uid}-wait-note`} className="block text-sm font-medium text-ink-muted mb-1">Commentaire (facultatif)</label>
            <textarea
              id={`${uid}-wait-note`}
              value={waitNote}
              onChange={(e) => setWaitNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setWaitOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={submitWait} disabled={dialogLoading}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {dialogLoading ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Renvoyer à l'intégration (spec 051, amendement de recette) */}
      <Modal open={handbackOpen} onClose={() => setHandbackOpen(false)} title="Renvoyer à l'équipe intégration">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Vous ne pouvez pas suivre {req.firstName} {req.lastName} ? La demande vous sera retirée,
            ainsi qu&apos;à votre famille, et redeviendra une demande reçue à traiter par l&apos;équipe
            intégration, qui sera prévenue.
          </p>
          <div>
            <label htmlFor={`${uid}-handback-reason`} className="block text-sm font-medium text-ink-muted mb-1">
              Raison <span className="text-danger">*</span>
            </label>
            <textarea
              id={`${uid}-handback-reason`}
              value={handbackReason}
              onChange={(e) => setHandbackReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex : habite hors de notre secteur, plus proche d'une autre famille…"
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setHandbackOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={submitHandback} disabled={dialogLoading || !handbackReason.trim()}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {dialogLoading ? "Envoi…" : "Renvoyer à l'intégration"}
            </button>
          </div>
        </div>
      </Modal>

      {/* J'ai relancé (spec 051) */}
      <Modal open={relanceOpen} onClose={() => setRelanceOpen(false)} title="J'ai relancé">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {req.status === "WAITING_MISSION"
              ? "Vous avez relancé le département mission."
              : `Vous avez recontacté ${req.firstName} ${req.lastName}.`}{" "}
            La demande reste en attente et le délai avant la prochaine alerte repart de zéro.
          </p>
          <div>
            <label htmlFor={`${uid}-relance-note`} className="block text-sm font-medium text-ink-muted mb-1">Commentaire (facultatif)</label>
            <textarea
              id={`${uid}-relance-note`}
              value={relanceNote}
              onChange={(e) => setRelanceNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex : message laissé sur répondeur…"
              className="w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRelanceOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
            <button onClick={submitRelance} disabled={dialogLoading}
              className="px-4 py-2 bg-brand text-on-brand text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
              {dialogLoading ? "Enregistrement…" : "Consigner la relance"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rouvrir (spec 051) */}
      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Rouvrir la demande">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Comment reprendre la demande de {req.firstName} {req.lastName} ?</p>
          <div className="space-y-2">
            <button
              onClick={() => submitReopen("resume")}
              disabled={dialogLoading}
              className="w-full text-left border border-line hover:border-brand rounded-lg px-3 py-2 disabled:opacity-50 transition-colors"
            >
              <span className="block text-sm font-medium text-ink">Reprendre où elle en était</span>
              <span className="block text-xs text-ink-muted">La demande retrouve l&apos;état qui précédait son abandon.</span>
            </button>
            <button
              onClick={() => submitReopen("restart")}
              disabled={dialogLoading}
              className="w-full text-left border border-line hover:border-brand rounded-lg px-3 py-2 disabled:opacity-50 transition-colors"
            >
              <span className="block text-sm font-medium text-ink">Reprendre de zéro</span>
              <span className="block text-xs text-ink-muted">
                La famille et le berger affectés sont retirés{req.assignedBerger?.name ? ` (${req.assignedBerger.name} en sera informé)` : ""}.
              </span>
            </button>
          </div>
          <div className="flex justify-end">
            <button onClick={() => setReopenOpen(false)} className="px-4 py-2 text-sm text-ink-muted hover:text-ink">Annuler</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
