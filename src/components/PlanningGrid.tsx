"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Check, CircleCheck, CircleDashed, CloudAlert, Lock, MessageSquare, Repeat, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import StatusChip, { statusToneClasses } from "@/components/ui/StatusChip";
import { SERVICE_STATUS, SERVICE_STATUS_ORDER, serviceStatusDescriptor } from "@/components/ui/status";
import { useToast } from "@/components/ui/Toast";
import type { ServiceStatus } from "@/generated/prisma/client";
import TaskPanel from "./TaskPanel";

type AvailabilityState = "AVAILABLE" | "IF_NEEDED" | "UNAVAILABLE" | "NO_RESPONSE" | "NOT_ASKED";

/** Disponibilité dérivée d'un STAR pour l'événement (spec 058, ADR-0020) — jamais un statut de planning. */
interface MemberAvailability {
  state: AvailabilityState;
  overdue: boolean;
  source: "response" | "period" | "asked" | "none";
  enteredByThirdParty: boolean;
  busyElsewhere: string[];
}

interface MemberPlanning {
  id: string;
  firstName: string;
  lastName: string;
  status: string | null;
  planningId: string | null;
  availability?: MemberAvailability | null;
}

interface AvailabilityCounts {
  available: number;
  ifNeeded: number;
  noResponse: number;
  unavailable: number;
}

/** Ordre de la liste : disponibles, si besoin, sans réponse, puis pas disponibles. */
const AVAILABILITY_RANK: Record<AvailabilityState, number> = {
  AVAILABLE: 0,
  IF_NEEDED: 1,
  NOT_ASKED: 2,
  NO_RESPONSE: 3,
  UNAVAILABLE: 4,
};

function rank(a: MemberAvailability | null | undefined): number {
  if (!a) return AVAILABILITY_RANK.NOT_ASKED;
  // Sans réponse après la date limite = traité comme indisponible, donc en bas de liste.
  if (a.state === "NO_RESPONSE" && a.overdue) return AVAILABILITY_RANK.UNAVAILABLE;
  return AVAILABILITY_RANK[a.state];
}

/** Raison affichée quand on place un STAR indisponible (avertissement, jamais un blocage). */
function unavailabilityReason(a: MemberAvailability | null | undefined): string | null {
  if (!a) return null;
  if (a.state === "UNAVAILABLE") {
    return a.source === "period" ? "Période d'indisponibilité déclarée" : "A répondu « Pas disponible »";
  }
  if (a.state === "NO_RESPONSE" && a.overdue) return "Sans réponse après la date limite";
  return null;
}

// Le texte est toujours affiché (pas seulement via `title`) : les tooltips ne sont pas accessibles au toucher.
function AvailabilityChip({ availability }: { readonly availability: MemberAvailability | null | undefined }) {
  if (!availability || availability.state === "NOT_ASKED") {
    return <StatusChip tone="neutral">Non demandée</StatusChip>;
  }
  switch (availability.state) {
    case "AVAILABLE":
      return <StatusChip tone="success" icon={Check}>Disponible</StatusChip>;
    case "IF_NEEDED":
      return <StatusChip tone="warning" icon={Repeat}>Si besoin</StatusChip>;
    case "UNAVAILABLE":
      return (
        <StatusChip tone="danger" icon={X}>
          {availability.source === "period" ? "Indisponible · période" : "Pas disponible"}
        </StatusChip>
      );
    default:
      return availability.overdue ? (
        <StatusChip tone="danger" icon={TriangleAlert}>Sans réponse · en retard</StatusChip>
      ) : (
        <StatusChip tone="neutral" icon={CircleDashed}>Sans réponse</StatusChip>
      );
  }
}

interface PlanningGridProps {
  readonly eventId: string;
  readonly departmentId: string;
  readonly readOnly?: boolean;
}

/** Statuts que l'on peut poser : `INDISPONIBLE` n'est plus un statut de planning (spec 058). */
const PLANNABLE_STATUSES = SERVICE_STATUS_ORDER.filter((s) => s !== "INDISPONIBLE");

/**
 * Pictogramme de chaque bouton du contrôle segmenté (maquettes : check, message, x, repeat),
 * repris aussi par les pastilles de décompte du pied de grille et par la légende ci-dessous —
 * une seule correspondance icône/statut dans toute la grille.
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
    <fieldset aria-label={`Statut de ${memberName}`} className="inline-flex min-w-0 shrink-0 gap-0.5 rounded-control bg-surface-sunken p-[3px]">
      {PLANNABLE_STATUSES.map((value) => {
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
            className={`grid h-11 w-11 place-items-center rounded-[7px] transition-[background-color,color,transform] duration-120
              active:scale-[0.96] motion-reduce:active:scale-100
              focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                active ? statusToneClasses[tone] : "text-ink-subtle hover:bg-surface hover:text-ink"
              }`}
          >
            <Icon aria-hidden="true" className="size-[18px]" strokeWidth={active ? 2.25 : 1.75} />
          </button>
        );
      })}
    </fieldset>
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

/** Ligne d'un STAR : disponibilité, autres services, alerte d'indisponibilité et statut. */
function MemberRow({
  member,
  isReadOnly,
  onStatusChange,
}: {
  readonly member: MemberPlanning;
  readonly isReadOnly: boolean;
  readonly onStatusChange: (memberId: string, status: string | null) => void;
}) {
  const name = `${member.firstName} ${member.lastName}`;
  const reason = unavailabilityReason(member.availability);
  const placed = member.status === "EN_SERVICE" || member.status === "EN_SERVICE_DEBRIEF" || member.status === "REMPLACANT";
  const busy = member.availability?.busyElsewhere ?? [];
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken/60"
    >
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="max-w-full truncate text-[15px] font-semibold leading-[22px] text-ink">{name}</span>
        <AvailabilityChip availability={member.availability} />
        {busy.length > 0 && (
          <span className="text-[13px] leading-[18px] text-ink-muted">De service en {busy.join(", ")}</span>
        )}
        {member.availability?.enteredByThirdParty && (
          <span className="text-[13px] leading-[18px] text-ink-subtle">Réponse saisie par un responsable</span>
        )}
        {placed && reason && (
          <Alert tone="warning" className="mt-1 w-full">
            {reason} : à confirmer avec {member.firstName} avant de valider son service.
          </Alert>
        )}
      </div>
      {isReadOnly ? (
        <ReadOnlyStatus status={member.status} />
      ) : (
        <StatusSegments
          memberName={name}
          status={member.status}
          onChange={(status) => onStatusChange(member.id, status)}
        />
      )}
    </li>
  );
}

/** Échéance de saisie : à venir, ou dépassée (encore modifiable ou non). */
function DeadlineAlert({
  deadlineLabel,
  deadlinePassed,
  canStillEdit,
}: {
  readonly deadlineLabel: string;
  readonly deadlinePassed: boolean;
  readonly canStillEdit: boolean;
}) {
  if (!deadlinePassed) return <Alert tone="info">Planning à remplir avant le {deadlineLabel}.</Alert>;
  return (
    <Alert tone={canStillEdit ? "warning" : "danger"} title="Échéance dépassée.">
      Le planning devait être rempli avant le {deadlineLabel}.
      {canStillEdit && " Vous pouvez encore le modifier."}
    </Alert>
  );
}

export default function PlanningGrid({
  eventId,
  departmentId,
  readOnly = false,
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
  const [availCounts, setAvailCounts] = useState<AvailabilityCounts | null>(null);
  const [canAskTeam, setCanAskTeam] = useState(false);
  const [relanceAvailable, setRelanceAvailable] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"ask" | "relance" | null>(null);
  const [acting, setActing] = useState(false);
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
      setAvailCounts(data.counts ?? null);
      setCanAskTeam(data.canAskTeam ?? false);
      setRelanceAvailable(data.manualRelanceAvailable ?? false);
      setDirty(false);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId, departmentId]);

  useEffect(() => {
    void fetchPlanning();
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
                status: m.status === "INDISPONIBLE" ? null : m.status,
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

  async function runTeamAction(action: "ask" | "relance") {
    setActing(true);
    try {
      const res = await fetch(`/api/events/${eventId}/departments/${departmentId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Action impossible");
      const n = json.notified ?? 0;
      toast.success(
        action === "ask"
          ? `Équipe interrogée : ${plural(n, "STAR notifié", "STAR notifiés")}`
          : `Relance envoyée : ${plural(n, "STAR relancé", "STAR relancés")}`
      );
      setConfirmAction(null);
      await fetchPlanning();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
      setConfirmAction(null);
    } finally {
      setActing(false);
    }
  }

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

  const sortedMembers = [...members].sort(
    (a, b) => rank(a.availability) - rank(b.availability) || a.lastName.localeCompare(b.lastName, "fr")
  );
  const counts = PLANNABLE_STATUSES.map((status) => ({
    status,
    count: members.filter((m) => m.status === status).length,
  }));
  const unset = members.filter((m) => !serviceStatusDescriptor(m.status)).length;
  const enService = members.filter(
    (m) => m.status === "EN_SERVICE" || m.status === "EN_SERVICE_DEBRIEF"
  ).length;

  let availabilitySummary: string | null = null;
  if (availCounts) {
    const plural = availCounts.available > 1 ? "s" : "";
    availabilitySummary = `${availCounts.available} disponible${plural} · ${availCounts.ifNeeded} si besoin · ${availCounts.noResponse} sans réponse`;
  }

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
      {deadlineLabel && (
        <DeadlineAlert
          deadlineLabel={deadlineLabel}
          deadlinePassed={deadlinePassed}
          canStillEdit={canBypassDeadline && !readOnly}
        />
      )}

      {/* Légende (docs/design-system/components/PlanningGrid.md) : le contrôle segmenté
          ci-dessous n'affiche qu'une icône par bouton, illisible sans elle. Lecture seule :
          chaque ligne affiche déjà son statut en texte (ReadOnlyStatus), pas besoin de légende. */}
      {!isReadOnly && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[13px] leading-[18px] text-ink-muted">
          {PLANNABLE_STATUSES.map((status) => {
            const Icon = SEGMENT_ICON[status];
            const { label } = SERVICE_STATUS[status];
            return (
              <li key={status} className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
                {label}
              </li>
            );
          })}
        </ul>
      )}

      {canAskTeam && !isReadOnly && availCounts && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirmAction("ask")}>
            Interroger l&apos;équipe sur leurs disponibilités
          </Button>
          {availCounts.noResponse > 0 && (
            <Button variant="secondary" size="sm" disabled={!relanceAvailable} onClick={() => setConfirmAction("relance")}>
              {relanceAvailable ? "Relancer les sans-réponse" : "Relance déjà envoyée aujourd'hui"}
            </Button>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction === "relance" ? "Relancer les STAR sans réponse ?" : "Interroger l'équipe sur leurs disponibilités ?"}
        message={
          confirmAction === "relance"
            ? "Les STAR qui n'ont pas répondu pour cet événement reçoivent une notification. Une seule relance est possible par jour."
            : "Tous les STAR du département reçoivent une notification pour indiquer leur disponibilité sur cet événement."
        }
        confirmLabel={confirmAction === "relance" ? "Relancer" : "Interroger"}
        variant="primary"
        confirming={acting}
        onConfirm={() => confirmAction && runTeamAction(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />

      <section aria-label="Planning de l'équipe" className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-sunken px-4 py-2.5">
          <p className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">
            {plural(members.length, "STAR", "STAR")} · {enService} en service
          </p>
          {availabilitySummary && (
            <p className="w-full text-[13px] leading-[18px] text-ink-muted" aria-label="Disponibilités">
              {availabilitySummary}
            </p>
          )}
          <SaveState
            isReadOnly={isReadOnly}
            deadlinePassed={deadlinePassed}
            saving={saving}
            dirty={dirty}
            saveError={saveError}
          />
        </div>

        <ul className="divide-y divide-line">
          {sortedMembers.map((member) => (
            <MemberRow key={member.id} member={member} isReadOnly={isReadOnly} onStatusChange={handleStatusChange} />
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 border-t border-line bg-surface-sunken px-4 py-3" aria-label="Décompte par statut">
          {counts.filter(({ count }) => count > 0).map(({ status, count }) => {
            const { tone } = SERVICE_STATUS[status];
            const [singular, pluralForm] = COUNT_LABELS[status];
            return (
              <StatusChip key={status} tone={tone} icon={SEGMENT_ICON[status]}>
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
