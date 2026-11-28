"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ExternalLink, Info, Mail, Pencil, Phone, Plus, X } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmModal,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusChip,
  Textarea,
  buttonClasses,
  fieldLabelClasses,
  type StatusTone,
} from "@/components/ui";
import HistoryTimeline from "@/components/HistoryTimeline";
import RadioGroup, { choiceChipClasses } from "@/components/ui/RadioGroup";
import { paths } from "@/lib/paths";

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

const STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:      "warning",
  WAITING_RECONTACT: "warning",
  WAITING_MISSION:   "warning",
  ASSIGNED:       "info",
  CONTACTED:      "info",
  WHATSAPP_ADDED: "success",
  INTEGRATED:     "success",
  ABANDONED:      "danger",
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

const MSDP_STATUS_TONES: Record<string, StatusTone> = {
  SUBMITTED:    "warning",
  ASSIGNED:     "info",
  CONTACTED:    "info",
  IN_FORMATION: "brand",
  COMPLETED:    "success",
  ABANDONED:    "danger",
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

// Piste d'avancement : étape à venir en `line`/`control-line` (surface-sunken est réservé aux
// en-têtes de tableau, champs de recherche et squelettes).
const TRACK_THEME = {
  violet: {
    circleCurrent: "bg-brand text-on-brand ring-2 ring-brand/20",
    circleDone:    "bg-brand-soft text-brand-text",
    circlePending: "bg-surface text-ink-muted ring-1 ring-control-line",
    lineActive:    "bg-brand",
    linePending:   "bg-line",
    dotActive:     "bg-brand",
    dotDone:       "bg-brand/35",
    dotPending:    "bg-control-line",
  },
  purple: {
    circleCurrent: "bg-brand text-on-brand ring-2 ring-brand/40",
    circleDone:    "bg-brand-soft text-brand-text",
    circlePending: "bg-surface text-ink-muted ring-1 ring-control-line",
    lineActive:    "bg-brand",
    linePending:   "bg-line",
    dotActive:     "bg-brand",
    dotDone:       "bg-brand/35",
    dotPending:    "bg-control-line",
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
  if (canToggle && !done) return "hover:bg-surface-sunken cursor-pointer";
  if (canToggle && done) return "hover:bg-success/20 cursor-pointer";
  return "cursor-default disabled:opacity-100";
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
                {step.done && !step.current ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : i + 1}
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
              ? "Terminé"
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
            className="inline-flex min-h-9 items-center rounded-full border border-dashed border-control-line px-3 text-xs text-ink-muted"
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
          : "bg-surface text-ink-muted border-control-line";
        const interactive = milestoneInteractiveClass(canToggle, done);

        return (
          <button
            key={m.key}
            type="button"
            disabled={!canToggle}
            aria-pressed={done}
            onClick={canToggle ? () => onToggle(m.key, done) : undefined}
            className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${base} ${interactive}`}
          >
            {done ? (
              <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
            ) : (
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
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
          <Button
            type="button"
            variant="secondary"
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
          >
            {loading ? "Création en cours…" : "Démarrer le suivi MSDP"}
          </Button>
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
          <StatusChip tone={MSDP_STATUS_TONES[followUp.status] ?? "neutral"}>
            {MSDP_STATUS_LABELS[followUp.status] ?? followUp.status}
          </StatusChip>
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
      <Link
        href={paths.care.followup(followUp.id)}
        className={buttonClasses("ghost", "sm")}
      >
        Voir et gérer le suivi
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Link>
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
    <PageHeader
      eyebrow="Demande d'intégration"
      title={`${req.firstName} ${req.lastName}`}
      description={`Reçue le ${fmt(req.submittedAt)}`}
      actions={
        canEdit ? (
          <Button type="button" variant="secondary" onClick={onEdit}>
            <Pencil aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Modifier la demande
          </Button>
        ) : undefined
      }
    >
      {(req.salvationCall || req.pastoralCareRequested || hasJourney) && (
        <div className="flex flex-wrap items-center gap-2">
          {req.salvationCall && <StatusChip tone="brand">Appel au salut</StatusChip>}
          {req.pastoralCareRequested && <StatusChip tone="warning">Soin pastoral</StatusChip>}
          {hasJourney && (
            <Link href={paths.integration.parcours()} className={buttonClasses("ghost", "sm")}>
              Voir le dossier parcours
              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Link>
          )}
        </div>
      )}
    </PageHeader>
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
            <span className="grid size-5 place-items-center rounded-full bg-danger-soft">
              <X aria-hidden="true" className="size-3" strokeWidth={3} />
            </span>
            Abandonné{req.abandonedAt ? ` le ${fmt(req.abandonedAt)}` : ""}
          </div>
          {req.abandonReasonCode && (
            <p className="text-xs text-ink-muted pl-7">
              Motif&nbsp;: {ABANDON_REASON_LABELS[req.abandonReasonCode] ?? req.abandonReasonCode}
            </p>
          )}
          {req.abandonReason && (
            <p className="text-xs text-ink-muted pl-7">{req.abandonReason}</p>
          )}
        </div>
      ) : (
        <TrackTimeline steps={steps} theme="violet" />
      )}

      {isWaiting && (
        <Alert
          tone="warning"
          title={`${req.status === "WAITING_MISSION" ? "En attente de la décision du département mission" : "En attente de recontact"}${req.waitingSince ? ` depuis le ${fmt(req.waitingSince)}` : ""}.`}
        >
          {req.lastRelanceAt && <span className="block">Dernière relance consignée le {fmt(req.lastRelanceAt)}.</span>}
          {relanceDue && (
            <span className="block font-semibold">
              À relancer : {req.status === "WAITING_MISSION" ? "le département mission" : "la personne"}.
            </span>
          )}
        </Alert>
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
    label: "Marquer ajouté·e au groupe WhatsApp",
    button: "Marquer ajouté au groupe WhatsApp",
    description: (req) => `Confirmer que ${req.firstName} ${req.lastName} a été ajouté·e dans le groupe WhatsApp famille ?`,
  },
  WHATSAPP_ADDED: {
    action: "integrate",
    label: "Marquer intégré·e",
    button: "Marquer intégré",
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
  // Un seul bouton principal : l'étape suivante du parcours quand il y en a une.
  const assignVariant = transition ? "secondary" : "primary";
  return (
    <div className="flex flex-col gap-3 pt-1">
      {showBergerNotice && (
        <Alert tone="info" icon={Info}>Vous êtes le berger assigné à cette demande.</Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {transition && (
          <Button
            type="button"
            onClick={() => onTransition({
              action: transition.action,
              label: transition.label,
              description: transition.description(req),
            })}
            disabled={loading}
          >
            {transition.button}
          </Button>
        )}
        {canAssign && (
          <Button type="button" variant={assignVariant} onClick={onAssign} disabled={loading}>
            {req.status === "ASSIGNED" ? "Réaffecter" : "Assigner"}
          </Button>
        )}
        {canReopen && (
          <Button type="button" onClick={onReopen} disabled={loading}>
            Rouvrir la demande
          </Button>
        )}
        {canLiftWait && (
          <>
            <Button
              type="button"
              onClick={() => onTransition({
                action: "resume",
                label: "Reprendre le suivi",
                description: `Reprendre le suivi de ${req.firstName} ${req.lastName} ? ${resumeHint(req.waitingFrom)}`,
              })}
              disabled={loading}
            >
              Reprendre le suivi
            </Button>
            <Button type="button" variant="secondary" onClick={onRelance} disabled={loading}>
              Consigner une relance
            </Button>
          </>
        )}
        {canWaitRecontact && (
          <Button type="button" variant="secondary" onClick={() => onWait("RECONTACT")} disabled={loading}>
            À recontacter plus tard
          </Button>
        )}
        {canSendToMission && (
          <Button type="button" variant="secondary" onClick={() => onWait("MISSION")} disabled={loading}>
            Transmettre au département mission
          </Button>
        )}
        {canHandback && (
          <Button type="button" variant="secondary" onClick={onHandback} disabled={loading}>
            Renvoyer à l&apos;intégration
          </Button>
        )}
        {canAbandon && (
          <Button type="button" variant="secondary" onClick={onAbandon} disabled={loading}>
            Abandonner la demande
          </Button>
        )}
      </div>
    </div>
  );
}

/** Ligne libellé / valeur des onglets de la fiche. */
function InfoRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="shrink-0 text-[13px] text-ink-muted sm:w-32">{label}</span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

const inlineLinkClasses = `${buttonClasses("ghost", "sm")} -ml-3 self-start`;

/** Onglet « Contact » de la fiche. */
function ContactTab({ req }: { readonly req: Request }) {
  return (
    <div className="flex flex-col gap-3">
      {req.phone ? (
        <InfoRow label="Téléphone">
          <a href={`tel:${req.phone}`} className={inlineLinkClasses}>
            <Phone aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {req.phone}
          </a>
        </InfoRow>
      ) : null}
      {req.email ? (
        <InfoRow label="Email">
          <a href={`mailto:${req.email}`} className={`${inlineLinkClasses} max-w-full break-all`}>
            <Mail aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
            {req.email}
          </a>
        </InfoRow>
      ) : null}
      {req.address && <InfoRow label="Adresse">{req.address}</InfoRow>}
      {req.member && <InfoRow label="Membre Koinonia">{req.member.firstName} {req.member.lastName}</InfoRow>}
      {!req.phone && !req.email && !req.address && !req.member && (
        <p className="text-sm text-ink-muted">Aucune information de contact renseignée.</p>
      )}
    </div>
  );
}

/** Onglet « Profil » de la fiche. */
function ProfileTab({ req, appointmentRequest }: { readonly req: Request; readonly appointmentRequest: Props["appointmentRequest"] }) {
  return (
    <div className="flex flex-col gap-3">
      <InfoRow label="Tranche d'âge">{AGE_LABELS[req.ageRange] ?? req.ageRange}</InfoRow>
      <InfoRow label="Situation">{CHURCH_STATUS_LABELS[req.churchStatus] ?? req.churchStatus}</InfoRow>
      <InfoRow label="Appel au salut">
        {req.salvationCall ? <StatusChip tone="brand">Oui</StatusChip> : "Non"}
      </InfoRow>
      <InfoRow label="Soin pastoral">
        {req.pastoralCareRequested ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusChip tone="warning">Demandé</StatusChip>
            {appointmentRequest && <span className="text-[13px] text-ink-muted">({appointmentRequest.status})</span>}
          </span>
        ) : "Non"}
      </InfoRow>
    </div>
  );
}

/** Onglet « Famille » de la fiche. */
function FamilyTab({ req }: { readonly req: Request }) {
  return (
    <div className="flex flex-col gap-3">
      {req.suggestedFamilyName && <InfoRow label="Suggestion géo">{req.suggestedFamilyName}</InfoRow>}
      {req.lat && req.lng && (
        <InfoRow label="Carte familles">
          <a
            href={`https://familles.iccrennes.fr/carte?lat=${req.lat}&lng=${req.lng}&label=${encodeURIComponent(req.address ?? [req.lat, req.lng].join(", "))}`}
            target="_blank"
            rel="noopener noreferrer"
            className={inlineLinkClasses}
          >
            Voir sur la carte familles
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <span className="sr-only">(nouvel onglet)</span>
          </a>
        </InfoRow>
      )}
      <InfoRow label="Famille assignée">
        {req.assignedFamilyName ? <span className="font-semibold">{req.assignedFamilyName}</span> : <span className="text-ink-muted">—</span>}
      </InfoRow>
      <InfoRow label="Berger">{req.assignedBerger?.name ?? <span className="text-ink-muted">—</span>}</InfoRow>
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
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <>
          <Textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={5}
            placeholder="Notes visibles uniquement par l'équipe intégration…"
            hint="Visibles uniquement par l'équipe intégration et le berger."
          />
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onSave} disabled={saving}>
              {saving ? "Enregistrement en cours…" : "Enregistrer les notes"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted whitespace-pre-line">{savedNotes || "Aucune note."}</p>
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
  const verb = milestone?.currentValue ? "Désactiver" : "Activer";
  return (
    <ConfirmModal
      open={milestone !== null}
      title={`${verb} le jalon « ${milestone?.label ?? ""} » ?`}
      message={`Le parcours de ${personName} sera mis à jour.`}
      confirmLabel={`${verb} le jalon`}
      confirmingLabel="Enregistrement en cours…"
      variant="primary"
      confirming={loading}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
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
    <ConfirmModal
      open={transition !== null}
      title={transition?.label ?? ""}
      message={transition?.description ?? ""}
      confirmLabel={transition?.label ?? "Confirmer"}
      confirmingLabel="Enregistrement en cours…"
      variant={transition?.variant === "danger" ? "danger" : "primary"}
      confirming={loading}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

/** Avancement du suivi MSDP : frise, ou abandon daté. */
function MsdpProgress({ steps, followUp }: { readonly steps: StepData[]; readonly followUp: MsdpFollowUpType | null }) {
  return (
    followUp?.status === "ABANDONED" ? (
      <div className="flex items-center gap-2 text-sm text-danger">
        <span className="grid size-5 place-items-center rounded-full bg-danger-soft">
          <X aria-hidden="true" className="size-3" strokeWidth={3} />
        </span>
        Abandonné{followUp.abandonedAt ? ` le ${fmt(followUp.abandonedAt)}` : ""}
      </div>
    ) : (
      <TrackTimeline steps={steps} theme="purple" />
    )
  );
}

const cardClasses = "flex flex-col gap-4";
const sectionTitleClasses = "font-display text-[15px] font-semibold leading-[22px] text-ink";

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
    <section className={cardClasses}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitleClasses}>Étapes clés du parcours</h2>
        {journey && (
          <Link href={paths.integration.parcours()} className={buttonClasses("ghost", "sm")}>
            Voir le dossier complet
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Link>
        )}
      </div>
      <MilestoneChips
        journey={journey}
        canToggle={isIntegrationMember && journey !== null}
        onToggle={onToggleMilestone}
      />
      {!journey && isIntegrationMember && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCreate} disabled={creating}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {creating ? "Création en cours…" : "Créer le dossier parcours"}
          </Button>
          {error && <span className="text-[13px] text-danger">{error}</span>}
        </div>
      )}
    </section>
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
    if (ok) { setHandbackOpen(false); setHandbackReason(""); router.push(paths.integration.requests()); }
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
    <div className="flex max-w-3xl flex-col gap-4">

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

      {error && <Alert tone="danger">{error}</Alert>}

      {/* ── Card 1 : Intégration famille ── */}
      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClasses}>Intégration famille</h2>
          <StatusChip tone={STATUS_TONES[req.status] ?? "neutral"}>
            {STATUS_LABELS[req.status] ?? req.status}
          </StatusChip>
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
      </section>

      <HistoryTimeline
        fetchUrl={`/api/integration/requests/${req.id}/history`}
        statusLabels={STATUS_LABELS}
        actionLabels={HISTORY_ACTION_LABELS}
        refreshKey={historyKey}
        title="Historique des statuts"
      />

      {/* ── Card 2 : Suivi MSDP — démarrable même sans appel au salut (#550) ── */}
      <section className={cardClasses}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClasses}>{req.salvationCall ? "Appel au salut — MSDP" : "Suivi MSDP"}</h2>
          {msdpFollowUp && (
            <StatusChip tone={MSDP_STATUS_TONES[msdpFollowUp.status] ?? "neutral"}>
              {MSDP_STATUS_LABELS[msdpFollowUp.status] ?? msdpFollowUp.status}
            </StatusChip>
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
      </section>

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

      {/* ── Onglets (contenu de la fiche, sans URL propre) ── */}
      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div role="tablist" aria-label="Fiche de la demande" className="flex overflow-x-auto border-b border-line">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`${uid}-panel`}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 font-display text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                activeTab === tab.id
                  ? "border-brand text-brand-text"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${activeTab}`} className="p-4 md:p-5">
          {activeTab === "contact" && <ContactTab req={req} />}
          {activeTab === "profil" && <ProfileTab req={req} appointmentRequest={appointmentRequest} />}
          {activeTab === "famille" && <FamilyTab req={req} />}
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
      </section>

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
          <p className="py-6 text-center text-sm text-ink-muted">Chargement en cours…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              id={`${uid}-assign-family`}
              label="Famille"
              value={assignFamilyId}
              onChange={(e) => { setAssignFamilyId(e.target.value); setAssignBergerId(""); }}
              placeholder="Choisir une famille…"
              options={families.map((f) => ({ value: String(f.id), label: f.name }))}
              hint={req.suggestedFamilyName ? `Suggestion géo : ${req.suggestedFamilyName}` : undefined}
            />
            <Select
              id={`${uid}-assign-berger`}
              label="Berger / co-berger"
              value={assignBergerId}
              onChange={(e) => setAssignBergerId(e.target.value)}
              disabled={!assignFamilyId}
              placeholder="Choisir un berger…"
              options={filteredLeaders.map((l) => ({
                value: l.user.id,
                label: `${l.user.name ?? l.user.email} (${l.role === "BERGER" ? "Berger" : "Co-berger"})`,
              }))}
              hint={assignFamilyId ? undefined : "Choisissez d'abord une famille."}
            />
            {assignFamilyId && filteredLeaders.length === 0 && (
              <Alert
                tone="warning"
                action={
                  <Link href={paths.integration.leaders()} className={buttonClasses("ghost", "sm")}>
                    Configurer les bergers
                  </Link>
                }
              >
                Aucun berger configuré pour cette famille.
              </Alert>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>Annuler</Button>
              <Button
                type="button"
                onClick={submitAssign}
                disabled={assignLoading || !assignFamilyId || !assignBergerId}
              >
                {assignLoading ? "Enregistrement en cours…" : "Assigner la demande"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modifier */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier la demande">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id={`${uid}-edit-first`} label="Prénom" type="text" autoComplete="off" value={editForm.firstName}
              onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} />
            <Input id={`${uid}-edit-last`} label="Nom" type="text" autoComplete="off" value={editForm.lastName}
              onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
          <Input id={`${uid}-edit-phone`} label="Téléphone" type="tel" inputMode="tel" value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
          <Input id={`${uid}-edit-email`} label="Email" type="email" value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
          <Input id={`${uid}-edit-address`} label="Adresse" type="text" value={editForm.address}
            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
          <fieldset className="min-w-0">
            <legend className={`${fieldLabelClasses} mb-2`}>Tranche d&apos;âge</legend>
            <div className="flex flex-wrap gap-2">
              {(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"] as const).map((v) => (
                <label key={v} className={choiceChipClasses(editForm.ageRange === v)}>
                  <input type="radio" name="editAgeRange" value={v} checked={editForm.ageRange === v} onChange={() => setEditForm((f) => ({ ...f, ageRange: v }))} className="sr-only" />
                  {AGE_LABELS[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className={`${fieldLabelClasses} mb-2`}>Situation à l&apos;église</legend>
            <div className="flex flex-wrap gap-2">
              {(["VISITOR", "REGULAR", "ENGAGED"] as const).map((v) => (
                <label key={v} className={choiceChipClasses(editForm.churchStatus === v)}>
                  <input type="radio" name="editChurchStatus" value={v} checked={editForm.churchStatus === v} onChange={() => setEditForm((f) => ({ ...f, churchStatus: v }))} className="sr-only" />
                  {CHURCH_STATUS_LABELS[v]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button type="button" onClick={submitEdit} disabled={editLoading || !editForm.firstName || !editForm.lastName}>
              {editLoading ? "Enregistrement en cours…" : "Enregistrer les modifications"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Abandonner */}
      <Modal open={abandonOpen} onClose={() => setAbandonOpen(false)} title="Abandonner la demande">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Cette demande sera marquée comme abandonnée. Elle pourra être rouverte si nécessaire.
          </p>
          <RadioGroup
            legend="Motif"
            name="abandonReasonCode"
            value={abandonReasonCode}
            onChange={setAbandonReasonCode}
            options={ABANDON_REASON_OPTIONS.map(([value, label]) => ({ value, label }))}
          />
          <Textarea
            id={`${uid}-abandon-reason`}
            label="Commentaire (facultatif)"
            value={abandonReason}
            onChange={(e) => setAbandonReason(e.target.value)}
            rows={3}
            placeholder="Ex : sans nouvelles après 3 relances…"
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setAbandonOpen(false)}>Annuler</Button>
            <Button type="button" onClick={submitAbandon} disabled={abandonLoading || !abandonReasonCode}>
              {abandonLoading ? "Enregistrement en cours…" : "Abandonner la demande"}
            </Button>
          </div>
          {!abandonReasonCode && <p className="text-[13px] text-ink-muted sm:text-right">Choisissez un motif pour abandonner la demande.</p>}
        </div>
      </Modal>

      {/* À recontacter plus tard / Transmettre au département mission (spec 051) */}
      <Modal
        open={waitOpen}
        onClose={() => setWaitOpen(false)}
        title={waitKind === "MISSION" ? "Transmettre au département mission" : "À recontacter plus tard"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            {waitKind === "MISSION"
              ? "L'adresse ne correspond à aucune famille d'impact : la décision revient au département mission."
              : `${req.firstName} ${req.lastName} souhaite être recontacté·e plus tard, ou n'a pas pu être joint·e pour l'instant.`}{" "}
            La demande sort de la file à traiter ; une alerte de relance sera émise à l&apos;équipe
            intégration une fois le délai écoulé.
          </p>
          <Textarea
            id={`${uid}-wait-note`}
            label="Commentaire (facultatif)"
            value={waitNote}
            onChange={(e) => setWaitNote(e.target.value)}
            rows={2}
            maxLength={1000}
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setWaitOpen(false)}>Annuler</Button>
            <Button type="button" onClick={submitWait} disabled={dialogLoading}>
              {dialogLoading ? "Enregistrement en cours…" : waitKind === "MISSION" ? "Transmettre au département mission" : "Mettre en attente"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Renvoyer à l'intégration (spec 051, amendement de recette) */}
      <Modal open={handbackOpen} onClose={() => setHandbackOpen(false)} title="Renvoyer à l'équipe intégration">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Vous ne pouvez pas suivre {req.firstName} {req.lastName} ? La demande vous sera retirée,
            ainsi qu&apos;à votre famille, et redeviendra une demande reçue à traiter par l&apos;équipe
            intégration, qui sera prévenue.
          </p>
          <Textarea
            id={`${uid}-handback-reason`}
            label="Raison"
            value={handbackReason}
            onChange={(e) => setHandbackReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex : habite hors de notre secteur, plus proche d'une autre famille…"
            hint="Obligatoire : elle est transmise à l'équipe intégration."
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setHandbackOpen(false)}>Annuler</Button>
            <Button type="button" onClick={submitHandback} disabled={dialogLoading || !handbackReason.trim()}>
              {dialogLoading ? "Envoi en cours…" : "Renvoyer à l'intégration"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Consigner une relance (spec 051) */}
      <Modal open={relanceOpen} onClose={() => setRelanceOpen(false)} title="Consigner une relance">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            {req.status === "WAITING_MISSION"
              ? "Vous avez relancé le département mission."
              : `Vous avez recontacté ${req.firstName} ${req.lastName}.`}{" "}
            La demande reste en attente et le délai avant la prochaine alerte repart de zéro.
          </p>
          <Textarea
            id={`${uid}-relance-note`}
            label="Commentaire (facultatif)"
            value={relanceNote}
            onChange={(e) => setRelanceNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ex : message laissé sur répondeur…"
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setRelanceOpen(false)}>Annuler</Button>
            <Button type="button" onClick={submitRelance} disabled={dialogLoading}>
              {dialogLoading ? "Enregistrement en cours…" : "Consigner la relance"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rouvrir (spec 051) */}
      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Rouvrir la demande">
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">Comment reprendre la demande de {req.firstName} {req.lastName} ?</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => submitReopen("resume")}
              disabled={dialogLoading}
              className={choiceCardClasses}
            >
              <span className="block text-[15px] font-semibold text-ink">Reprendre où elle en était</span>
              <span className="block text-[13px] text-ink-muted">La demande retrouve l&apos;état qui précédait son abandon.</span>
            </button>
            <button
              type="button"
              onClick={() => submitReopen("restart")}
              disabled={dialogLoading}
              className={choiceCardClasses}
            >
              <span className="block text-[15px] font-semibold text-ink">Reprendre de zéro</span>
              <span className="block text-[13px] text-ink-muted">
                La famille et le berger affectés sont retirés{req.assignedBerger?.name ? ` (${req.assignedBerger.name} en sera informé)` : ""}.
              </span>
            </button>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setReopenOpen(false)}>Annuler</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

/** Option à choisir dans un dialogue (titre + explication), au doigt. */
const choiceCardClasses =
  "w-full min-h-11 rounded-control border border-control-line bg-surface px-3 py-2 text-left transition-colors " +
  "hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-45";
