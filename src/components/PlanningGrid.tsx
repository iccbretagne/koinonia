"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Check, CircleCheck, CircleDashed, CloudAlert, Lock, MessageSquare, Repeat, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import StatusChip, { statusToneClasses } from "@/components/ui/StatusChip";
import { SERVICE_STATUS, SERVICE_STATUS_ORDER, serviceStatusDescriptor } from "@/components/ui/status";
import { useToast } from "@/components/ui/Toast";
import type { ServiceStatus } from "@/generated/prisma/client";
import TaskPanel from "./TaskPanel";

interface MemberPlanning {
  id: string;
  firstName: string;
  lastName: string;
  status: string | null;
  planningId: string | null;
  activeAbsence?: {
    id: string;
    kind: "PERIOD" | "EVENTS";
    startDate: string | null;
    endDate: string | null;
    eventCount: number;
  } | null;
}

type ActiveAbsence = NonNullable<MemberPlanning["activeAbsence"]>;

function formatAbsencePeriod(activeAbsence: ActiveAbsence): string {
  if (activeAbsence.kind === "EVENTS") return "Absence déclarée sur cet événement";
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
  return `Absence déclarée du ${fmt.format(new Date(activeAbsence.startDate!))} au ${fmt.format(new Date(activeAbsence.endDate!))}`;
}

function formatAbsencePeriodShort(activeAbsence: ActiveAbsence): string {
  if (activeAbsence.kind === "EVENTS") return "cet événement";
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${fmt.format(new Date(activeAbsence.startDate!))}–${fmt.format(new Date(activeAbsence.endDate!))}`;
}

// La période est affichée en texte (pas seulement via `title`) car les tooltips
// hover ne sont pas accessibles au toucher sur mobile.
function AbsenceBadge({
  activeAbsence,
  canViewAbsences,
}: {
  readonly activeAbsence: ActiveAbsence;
  readonly canViewAbsences: boolean;
}) {
  const text =
    activeAbsence.kind === "PERIOD"
      ? `Absent · période ${formatAbsencePeriodShort(activeAbsence)}`
      : "Absent · cet événement";

  if (canViewAbsences) {
    return (
      <Link
        href={`/absences?highlightId=${activeAbsence.id}`}
        title={formatAbsencePeriod(activeAbsence)}
        aria-label={`${formatAbsencePeriod(activeAbsence)} — voir le détail`}
        className="max-w-full rounded-chip hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <StatusChip tone="warning" icon={TriangleAlert}>{text}</StatusChip>
      </Link>
    );
  }

  return (
    <StatusChip tone="warning" icon={TriangleAlert} title={formatAbsencePeriod(activeAbsence)} aria-label={formatAbsencePeriod(activeAbsence)}>
      {text}
    </StatusChip>
  );
}

interface PlanningGridProps {
  readonly eventId: string;
  readonly departmentId: string;
  readonly readOnly?: boolean;
  readonly canViewAbsences?: boolean;
}

/**
 * Pictogramme de chaque bouton du contrôle segmenté (maquettes : check, message, x, repeat) —
 * volontairement plus sobre que l'icône cerclée des pastilles, pour tenir dans 40px.
 */
const SEGMENT_ICON: Record<ServiceStatus, LucideIcon> = {
  EN_SERVICE: Check,
  EN_SERVICE_DEBRIEF: MessageSquare,
  INDISPONIBLE: X,
  REMPLACANT: Repeat,
};

/**
 * Contrôle segmenté de statut (docs/design-system/components/PlanningGrid.md) : un appui au
 * lieu du menu déroulant. Le bouton actif prend le fond `-soft` et la couleur de son statut ; un
 * nouvel appui sur le statut actif le remet à « non renseigné », comme l'option « - » de
 * l'ancien sélecteur.
 */
function StatusSegments({
  memberName,
  status,
  onChange,
}: {
  readonly memberName: string;
  readonly status: string | null;
  readonly onChange: (status: ServiceStatus | null) => void;
}) {
  return (
    <div role="group" aria-label={`Statut de ${memberName}`} className="inline-flex shrink-0 gap-0.5 rounded-control bg-surface-sunken p-[3px]">
      {SERVICE_STATUS_ORDER.map((value) => {
        const { tone, label } = SERVICE_STATUS[value];
        const Icon = SEGMENT_ICON[value];
        const active = status === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={active ? `${label} — appuyer à nouveau pour retirer` : label}
            onClick={() => onChange(active ? null : value)}
            className={`grid h-10 w-10 place-items-center rounded-[7px] transition-[background-color,color,transform] duration-120
              active:scale-[0.96] motion-reduce:active:scale-100 sm:w-11
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                active ? statusToneClasses[tone] : "text-ink-subtle hover:bg-surface hover:text-ink"
              }`}
          >
            <Icon aria-hidden="true" className="size-[18px]" strokeWidth={active ? 2.25 : 1.75} />
          </button>
        );
      })}
    </div>
  );
}

/** Statut en lecture seule : la pastille (mot + icône), ou « Non renseigné ». */
function ReadOnlyStatus({ status }: { readonly status: string | null }) {
  const descriptor = serviceStatusDescriptor(status);
  if (!descriptor) {
    return (
      <StatusChip tone="neutral" icon={CircleDashed}>
        Non renseigné
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={descriptor.tone} icon={descriptor.icon}>
      {descriptor.label}
    </StatusChip>
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Libellés du décompte de pied de grille. */
const COUNT_LABELS: Record<ServiceStatus, [string, string]> = {
  EN_SERVICE: ["en service", "en service"],
  EN_SERVICE_DEBRIEF: ["en service + debrief", "en service + debrief"],
  INDISPONIBLE: ["indisponible", "indisponibles"],
  REMPLACANT: ["remplaçant", "remplaçants"],
};

export default function PlanningGrid({
  eventId,
  departmentId,
  readOnly = false,
  canViewAbsences = false,
}: PlanningGridProps) {
  const toast = useToast();
  const [members, setMembers] = useState<MemberPlanning[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [canBypassDeadline, setCanBypassDeadline] = useState(false);
  const [planningDeadline, setPlanningDeadline] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isReadOnly = readOnly || (deadlinePassed && !canBypassDeadline);

  const fetchPlanning = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/planning`
      );
      if (!res.ok) throw new Error("Failed to fetch planning");
      const data = await res.json();
      setMembers(data.members);
      setDeadlinePassed(data.deadlinePassed ?? false);
      setCanBypassDeadline(data.canBypassDeadline ?? false);
      setPlanningDeadline(data.planningDeadline ?? null);
      setDirty(false);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId, departmentId]);

  useEffect(() => {
    fetchPlanning();
  }, [fetchPlanning]);

  const savePlanning = useCallback(
    async (updatedMembers: MemberPlanning[]) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/events/${eventId}/departments/${departmentId}/planning`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plannings: updatedMembers.map((m) => ({
                memberId: m.id,
                status: m.status,
              })),
            }),
          }
        );
        if (!res.ok) throw new Error("Failed to save planning");
        setDirty(false);
        setSaveError(false);
      } catch {
        setSaveError(true);
        toast.error("Planning non enregistré. Vérifiez votre connexion, puis modifiez un statut pour réessayer.");
      } finally {
        setSaving(false);
      }
    },
    [eventId, departmentId, toast]
  );

  const handleStatusChange = (memberId: string, status: string | null) => {
    const updated = members.map((m) => {
      if (m.id === memberId) {
        return { ...m, status };
      }
      if (
        status === "EN_SERVICE_DEBRIEF" &&
        m.status === "EN_SERVICE_DEBRIEF"
      ) {
        return { ...m, status: "EN_SERVICE" };
      }
      return m;
    });

    setMembers(updated);
    setDirty(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => savePlanning(updated), 1000);
  };

  if (loading) {
    return <SkeletonList rows={6} label="Chargement du planning…" />;
  }

  if (fetchError) {
    return (
      <Alert
        tone="danger"
        title="Le planning n'a pas pu être chargé."
        action={
          <Button variant="ghost" size="sm" onClick={fetchPlanning}>
            Réessayer
          </Button>
        }
      >
        Vérifiez votre connexion.
      </Alert>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          title="Aucun STAR dans ce département"
          description="Ajoutez des STAR au département pour pouvoir les planifier."
          size="sm"
        />
      </div>
    );
  }

  const counts = SERVICE_STATUS_ORDER.map((status) => ({
    status,
    count: members.filter((m) => m.status === status).length,
  }));
  const unset = members.filter((m) => !serviceStatusDescriptor(m.status)).length;
  const enService = members.filter(
    (m) => m.status === "EN_SERVICE" || m.status === "EN_SERVICE_DEBRIEF"
  ).length;

  const deadlineLabel = planningDeadline
    ? new Date(planningDeadline).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {deadlineLabel &&
        (deadlinePassed ? (
          <Alert tone={canBypassDeadline && !readOnly ? "warning" : "danger"} title="Échéance dépassée.">
            Le planning devait être rempli avant le {deadlineLabel}.
            {canBypassDeadline && !readOnly && " Vous pouvez encore le modifier."}
          </Alert>
        ) : (
          <Alert tone="info">Planning à remplir avant le {deadlineLabel}.</Alert>
        ))}

      <section aria-label="Planning de l'équipe" className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-sunken px-4 py-2.5">
          <p className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
            {plural(members.length, "STAR", "STAR")} · {enService} en service
          </p>
          <SaveState
            isReadOnly={isReadOnly}
            deadlinePassed={deadlinePassed}
            saving={saving}
            dirty={dirty}
            saveError={saveError}
          />
        </div>

        <ul className="divide-y divide-line">
          {members.map((member) => {
            const name = `${member.firstName} ${member.lastName}`;
            return (
              <li
                key={member.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken/60"
              >
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <span className="max-w-full truncate text-[15px] font-semibold leading-[22px] text-ink">{name}</span>
                  {member.activeAbsence && (
                    <AbsenceBadge activeAbsence={member.activeAbsence} canViewAbsences={canViewAbsences} />
                  )}
                </div>
                {isReadOnly ? (
                  <ReadOnlyStatus status={member.status} />
                ) : (
                  <StatusSegments
                    memberName={name}
                    status={member.status}
                    onChange={(status) => handleStatusChange(member.id, status)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2 border-t border-line bg-surface-sunken px-4 py-3" aria-label="Décompte par statut">
          {counts.filter(({ count }) => count > 0).map(({ status, count }) => {
            const { tone, icon } = SERVICE_STATUS[status];
            const [singular, pluralForm] = COUNT_LABELS[status];
            return (
              <StatusChip key={status} tone={tone} icon={icon}>
                {plural(count, singular, pluralForm)}
              </StatusChip>
            );
          })}
          {unset > 0 && (
            <StatusChip tone="neutral" icon={CircleDashed}>
              {plural(unset, "non renseigné", "non renseignés")}
            </StatusChip>
          )}
        </div>
      </section>

      <TaskPanel
        eventId={eventId}
        departmentId={departmentId}
        eligibleMembers={members
          .filter((m) => m.status === "EN_SERVICE" || m.status === "EN_SERVICE_DEBRIEF")
          .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName }))}
        readOnly={isReadOnly}
      />
    </div>
  );
}

/** État d'enregistrement automatique, annoncé poliment aux lecteurs d'écran. */
function SaveState({
  isReadOnly,
  deadlinePassed,
  saving,
  dirty,
  saveError,
}: {
  readonly isReadOnly: boolean;
  readonly deadlinePassed: boolean;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly saveError: boolean;
}) {
  let content: { icon: LucideIcon; text: string; className: string };
  if (isReadOnly) {
    content = { icon: Lock, text: deadlinePassed ? "Échéance dépassée — lecture seule" : "Lecture seule", className: "text-ink-muted" };
  } else if (saving) {
    content = { icon: CircleDashed, text: "Enregistrement…", className: "text-ink-muted" };
  } else if (saveError) {
    content = { icon: CloudAlert, text: "Non enregistré", className: "text-danger" };
  } else if (dirty) {
    content = { icon: CircleDashed, text: "Modifications en attente…", className: "text-ink-muted" };
  } else {
    content = { icon: CircleCheck, text: "Enregistré automatiquement", className: "text-success" };
  }
  const Icon = content.icon;
  return (
    <p aria-live="polite" className={`inline-flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] ${content.className}`}>
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {content.text}
    </p>
  );
}
