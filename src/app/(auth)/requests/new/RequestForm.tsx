"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Palette,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { controlClasses, fieldLabelClasses, textareaClasses } from "@/components/ui/field-classes";
import { REQUEST_TYPE_ICON } from "../request-display";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/event-types";
import { ROLE_LABELS } from "@/lib/roles";

type RequestCategory = "announcement" | "visual" | "demand" | null;
type DemandType =
  | "AJOUT_EVENEMENT"
  | "MODIFICATION_EVENEMENT"
  | "ANNULATION_EVENEMENT"
  | "MODIFICATION_PLANNING"
  | "DEMANDE_ACCES";

export interface EditData {
  id: string;
  type: string;
  title: string;
  payload: Record<string, unknown>;
  announcement?: {
    id: string;
    title: string;
    content: string;
    eventDate: string | null;
    isSaveTheDate: boolean;
    isUrgent: boolean;
    channelInterne: boolean;
    channelExterne: boolean;
    targetEvents?: { eventId: string }[];
  } | null;
}

interface Props {
  readonly churchId: string;
  readonly canSubmitDemands: boolean;
  readonly showCareTile?: boolean;
  readonly showAccountingTile?: boolean;
  readonly announcementEvents: { id: string; title: string; type: string; date: string }[];
  readonly events: { id: string; title: string; type: string; date: string }[];
  readonly sourceOptions: { type: "department" | "ministry"; id: string; label: string }[];
  readonly departments: { id: string; name: string; ministryName: string }[];
  readonly users: { id: string; label: string }[];
  readonly ministries: { id: string; name: string }[];
  readonly editData?: EditData;
}

const DEMAND_TYPES: { key: DemandType; label: string; icon: LucideIcon }[] = [
  { key: "AJOUT_EVENEMENT", label: "Ajouter un événement", icon: REQUEST_TYPE_ICON.AJOUT_EVENEMENT },
  { key: "MODIFICATION_EVENEMENT", label: "Modifier un événement", icon: REQUEST_TYPE_ICON.MODIFICATION_EVENEMENT },
  { key: "ANNULATION_EVENEMENT", label: "Annuler un événement", icon: REQUEST_TYPE_ICON.ANNULATION_EVENEMENT },
  { key: "MODIFICATION_PLANNING", label: "Modifier les départements en service", icon: REQUEST_TYPE_ICON.MODIFICATION_PLANNING },
  { key: "DEMANDE_ACCES", label: "Demander un accès", icon: REQUEST_TYPE_ICON.DEMANDE_ACCES },
];

const fieldControl = controlClasses();
const selectControl = `${controlClasses()} cursor-pointer`;
const listBox = "flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-control border border-line p-2";
const checkRow = "flex min-h-11 cursor-pointer items-center gap-3 rounded-chip px-2 text-[15px] leading-[22px] text-ink hover:bg-surface-sunken";

/** Tuile de choix de l'étape 1 (bouton ou lien), carte entière cliquable. */
function ChoiceTile({
  icon: Icon,
  title,
  description,
  onClick,
  href,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly onClick?: () => void;
  readonly href?: string;
}) {
  const className =
    "flex min-h-16 w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors duration-120 " +
    "hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  const content = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-text">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-[22px] text-ink">{title}</span>
        {description && <span className="block text-[13px] leading-[18px] text-ink-muted">{description}</span>}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function ChoiceGroup({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const DEMAND_TYPE_KEYS = DEMAND_TYPES.map((d) => d.key) as string[];

// Les demandes d'accès n'ont rien à voir avec l'agenda des événements : sections distinctes.
const EVENT_DEMANDS = DEMAND_TYPES.filter((d) => d.key !== "DEMANDE_ACCES");
const ACCESS_DEMANDS = DEMAND_TYPES.filter((d) => d.key === "DEMANDE_ACCES");

const VISUAL_FORMATS = [
  "Story Instagram",
  "Post carré (1:1)",
  "Bannière web",
  "Affiche A4",
  "Slide / Écran",
  "Logo",
  "Autre",
];


const DEADLINE_OFFSETS = [
  { value: "", label: "Manuel" },
  { value: "6h", label: "6h avant" },
  { value: "12h", label: "12h avant" },
  { value: "1d", label: "1 jour avant" },
  { value: "2d", label: "2 jours avant" },
  { value: "3d", label: "3 jours avant" },
  { value: "5d", label: "5 jours avant" },
  { value: "7d", label: "7 jours avant" },
];

const RECURRENCE_RULES = [
  { value: "", label: "Pas de récurrence" },
  { value: "weekly", label: "Hebdomadaire" },
  { value: "biweekly", label: "Bihebdomadaire" },
  { value: "monthly", label: "Mensuel" },
];

function computeDeadlineFromOffset(eventDate: string, offset: string): string {
  if (!eventDate || !offset) return "";
  const match = offset.match(/^(\d+)(h|d)$/);
  if (!match) return "";
  const d = new Date(eventDate);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "h") d.setHours(d.getHours() - value);
  else if (unit === "d") d.setDate(d.getDate() - value);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ROLES_FOR_ACCESS = (["MINISTER", "DEPARTMENT_HEAD", "DISCIPLE_MAKER", "REPORTER"] as const).map(
  (value) => ({ value, label: ROLE_LABELS[value] })
);

function initFromEditData(editData: EditData): {
  category: RequestCategory;
  demandType: DemandType | null;
  // announcement fields
  annTitle: string;
  annContent: string;
  annEventDate: string;
  annIsUrgent: boolean;
  annChannelInterne: boolean;
  annChannelExterne: boolean;
  annTargetEventIds: string[];
  // demand fields
  eventTitle: string;
  eventType: string;
  eventDate: string;
  planningDeadline: string;
  deadlineOffset: string;
  eventDeptIds: string[];
  recurrenceRule: string;
  recurrenceEnd: string;
  selectedEventId: string;
  reason: string;
  planningDeptIds: string[];
  targetUserId: string;
  targetRole: string;
  targetMinistryId: string;
  targetDeptIds: string[];
} {
  const isAnnouncement = !!editData.announcement;
  const isDemand = DEMAND_TYPE_KEYS.includes(editData.type);
  const p = editData.payload;

  return {
    category: isAnnouncement ? "announcement" : isDemand ? "demand" : null,
    demandType: isDemand ? (editData.type as DemandType) : null,
    // announcement
    annTitle: editData.announcement?.title ?? "",
    annContent: editData.announcement?.content ?? "",
    annEventDate: editData.announcement?.eventDate
      ? editData.announcement.eventDate.split("T")[0]
      : "",
    annIsUrgent: editData.announcement?.isUrgent ?? false,
    annChannelInterne: editData.announcement?.channelInterne ?? true,
    annChannelExterne: editData.announcement?.channelExterne ?? false,
    annTargetEventIds: editData.announcement?.targetEvents?.map((t) => t.eventId) ?? [],
    // demand
    eventTitle: (p?.eventTitle as string) ?? (p?.changes as Record<string, unknown>)?.title as string ?? "",
    eventType: (p?.eventType as string) ?? ((p?.changes as Record<string, unknown>)?.type as string) ?? "",
    eventDate: (p?.eventDate as string) ?? ((p?.changes as Record<string, unknown>)?.date as string) ?? "",
    planningDeadline: (p?.planningDeadline as string) ?? ((p?.changes as Record<string, unknown>)?.planningDeadline as string) ?? "",
    deadlineOffset: (p?.deadlineOffset as string) ?? "",
    eventDeptIds: (p?.departmentIds as string[]) ?? [],
    recurrenceRule: (p?.recurrenceRule as string) ?? "",
    recurrenceEnd: (p?.recurrenceEnd as string) ?? "",
    selectedEventId: (p?.eventId as string) ?? "",
    reason: (p?.reason as string) ?? "",
    planningDeptIds: (p?.departmentIds as string[]) ?? [],
    targetUserId: (p?.targetUserId as string) ?? "",
    targetRole: (p?.role as string) ?? "MINISTER",
    targetMinistryId: (p?.ministryId as string) ?? "",
    targetDeptIds: (p?.departmentIds as string[]) ?? [],
  };
}

export default function RequestForm({
  churchId,
  canSubmitDemands,
  showCareTile = false,
  showAccountingTile = false,
  announcementEvents,
  events,
  sourceOptions,
  departments,
  users,
  ministries,
  editData,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const isEditMode = !!editData;

  const init = editData ? initFromEditData(editData) : null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<RequestCategory>(init?.category ?? null);
  const [demandType, setDemandType] = useState<DemandType | null>(init?.demandType ?? null);

  // Visual fields
  const [visualTitle, setVisualTitle] = useState("");
  const [visualBrief, setVisualBrief] = useState("");
  const [visualFormat, setVisualFormat] = useState("");
  const [visualDeadline, setVisualDeadline] = useState("");
  const [visualSourceId, setVisualSourceId] = useState(sourceOptions[0]?.id ?? "");

  // Announcement fields
  const [annTitle, setAnnTitle] = useState(init?.annTitle ?? "");
  const [annContent, setAnnContent] = useState(init?.annContent ?? "");
  const [annEventDate, setAnnEventDate] = useState(init?.annEventDate ?? "");
  const [annIsUrgent, setAnnIsUrgent] = useState(init?.annIsUrgent ?? false);
  const [annChannelInterne, setAnnChannelInterne] = useState(init?.annChannelInterne ?? true);
  const [annChannelExterne, setAnnChannelExterne] = useState(init?.annChannelExterne ?? false);
  const [annSourceId, setAnnSourceId] = useState(sourceOptions[0]?.id ?? "");
  const [annTargetEventIds, setAnnTargetEventIds] = useState<string[]>(init?.annTargetEventIds ?? []);

  function toggleEvent(id: string) {
    setAnnTargetEventIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Demand fields
  const [eventTitle, setEventTitle] = useState(init?.eventTitle ?? "");
  const [eventType, setEventType] = useState(init?.eventType ?? "CULTE");
  const [eventDate, setEventDate] = useState(init?.eventDate ?? "");
  const [planningDeadline, setPlanningDeadline] = useState(init?.planningDeadline ?? "");
  const [deadlineOffset, setDeadlineOffset] = useState(init?.deadlineOffset ?? "");
  const [eventDeptIds, setEventDeptIds] = useState<string[]>(init?.eventDeptIds ?? []);
  const [recurrenceRule, setRecurrenceRule] = useState(init?.recurrenceRule ?? "");
  const [recurrenceEnd, setRecurrenceEnd] = useState(init?.recurrenceEnd ?? "");
  const [selectedEventId, setSelectedEventId] = useState(init?.selectedEventId ?? "");
  const [reason, setReason] = useState(init?.reason ?? "");
  const [planningDeptIds, setPlanningDeptIds] = useState<string[]>(init?.planningDeptIds ?? []);
  const [loadingEventDepts, setLoadingEventDepts] = useState(false);
  const [targetUserId, setTargetUserId] = useState(init?.targetUserId ?? "");
  const [targetRole, setTargetRole] = useState(init?.targetRole ?? "MINISTER");
  const [targetMinistryId, setTargetMinistryId] = useState(init?.targetMinistryId ?? "");
  const [targetDeptIds, setTargetDeptIds] = useState<string[]>(init?.targetDeptIds ?? []);

  async function loadEventDepartments(eventId: string) {
    if (!eventId) return;
    setLoadingEventDepts(true);
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        const assignedIds: string[] = (data.data?.eventDepts ?? []).map(
          (ed: { departmentId: string }) => ed.departmentId
        );
        setPlanningDeptIds(assignedIds);
      }
    } catch {
      // ignore
    } finally {
      setLoadingEventDepts(false);
    }
  }

  function reset() {
    setCategory(null);
    setDemandType(null);
    setError(null);
  }

  async function submitVisual() {
    const source = sourceOptions.find((s) => s.id === visualSourceId);
    return fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId,
        type: "VISUEL",
        title: visualTitle,
        brief: visualBrief || null,
        format: visualFormat || null,
        deadline: visualDeadline || null,
        departmentId: source?.type === "department" ? source.id : null,
        ministryId: source?.type === "ministry" ? source.id : null,
      }),
    });
  }

  async function submitAnnouncement() {
    if (isEditMode && editData?.announcement) {
      // PATCH the announcement
      const annRes = await fetch(`/api/announcements/${editData.announcement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: annTitle,
          content: annContent,
          eventDate: annEventDate || null,
          isUrgent: annIsUrgent,
          channelInterne: annChannelInterne,
          channelExterne: annChannelExterne,
          targetEventIds: annTargetEventIds,
        }),
      });
      return annRes;
    }

    const source = sourceOptions.find((s) => s.id === annSourceId);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId,
        title: annTitle,
        content: annContent,
        eventDate: annEventDate || null,
        isUrgent: annIsUrgent,
        channelInterne: annChannelInterne,
        channelExterne: annChannelExterne,
        departmentId: source?.type === "department" ? source.id : null,
        ministryId: source?.type === "ministry" ? source.id : null,
        targetEventIds: annTargetEventIds,
      }),
    });
    return res;
  }

  async function submitDemand() {
    if (!demandType) return null;

    let title = "";
    let payload: Record<string, unknown> = {};

    switch (demandType) {
      case "AJOUT_EVENEMENT":
        title = `Ajout ${eventType} du ${new Date(eventDate).toLocaleDateString("fr-FR")}`;
        payload = {
          eventTitle,
          eventType,
          eventDate,
          planningDeadline: planningDeadline || undefined,
          deadlineOffset: deadlineOffset || undefined,
          departmentIds: eventDeptIds,
          recurrenceRule: recurrenceRule || undefined,
          recurrenceEnd: recurrenceEnd || undefined,
        };
        break;
      case "MODIFICATION_EVENEMENT": {
        const evt = events.find((e) => e.id === selectedEventId);
        title = `Modification : ${evt?.title ?? "événement"}`;
        payload = {
          eventId: selectedEventId,
          changes: {
            title: eventTitle || undefined,
            type: eventType || undefined,
            date: eventDate || undefined,
            planningDeadline: planningDeadline || undefined,
          },
        };
        break;
      }
      case "ANNULATION_EVENEMENT": {
        const evt2 = events.find((e) => e.id === selectedEventId);
        title = `Annulation : ${evt2?.title ?? "événement"}`;
        payload = { eventId: selectedEventId, reason };
        break;
      }
      case "MODIFICATION_PLANNING": {
        const evt3 = events.find((e) => e.id === selectedEventId);
        title = `Modification départements — ${evt3?.title ?? "événement"}`;
        payload = {
          eventId: selectedEventId,
          departmentIds: planningDeptIds,
        };
        break;
      }
      case "DEMANDE_ACCES": {
        const user = users.find((u) => u.id === targetUserId);
        title = `Accès ${targetRole} pour ${user?.label ?? "utilisateur"}`;
        payload = {
          targetUserId,
          role: targetRole,
          ...(targetRole === "MINISTER" && targetMinistryId ? { ministryId: targetMinistryId } : {}),
          ...(targetRole === "DEPARTMENT_HEAD" && targetDeptIds.length ? { departmentIds: targetDeptIds } : {}),
        };
        break;
      }
    }

    if (isEditMode && editData) {
      const res = await fetch(`/api/requests/${editData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, payload }),
      });
      return res;
    }

    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId,
        type: demandType,
        title,
        payload,
      }),
    });
    return res;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = category === "announcement"
        ? await submitAnnouncement()
        : category === "visual"
        ? await submitVisual()
        : await submitDemand();

      if (!res) return;

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Une erreur est survenue.");
        return;
      }

      toast.success(isEditMode ? "Demande modifiée" : "Demande envoyée");
      router.push("/requests");
    } catch {
      setError("Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 1: Choose category (skipped in edit mode)
  if (!category) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <ChoiceGroup title="Communication et médias">
          <ChoiceTile
            icon={Megaphone}
            title="Diffuser une annonce"
            description="En interne et/ou sur les réseaux sociaux"
            onClick={() => setCategory("announcement")}
          />
          <ChoiceTile
            icon={Palette}
            title="Demander un visuel"
            description="Commande directe à la Production Média"
            onClick={() => setCategory("visual")}
          />
        </ChoiceGroup>

        {canSubmitDemands && (
          <>
            <ChoiceGroup title="Événements et planning">
              {EVENT_DEMANDS.map((dt) => (
                <ChoiceTile
                  key={dt.key}
                  icon={dt.icon}
                  title={dt.label}
                  onClick={() => {
                    setCategory("demand");
                    setDemandType(dt.key);
                  }}
                />
              ))}
            </ChoiceGroup>

            <ChoiceGroup title="Accès et habilitations">
              {ACCESS_DEMANDS.map((dt) => (
                <ChoiceTile
                  key={dt.key}
                  icon={dt.icon}
                  title={dt.label}
                  onClick={() => {
                    setCategory("demand");
                    setDemandType(dt.key);
                  }}
                />
              ))}
            </ChoiceGroup>
          </>
        )}

        {(showCareTile || showAccountingTile) && (
          <ChoiceGroup title="Accompagnement et finances">
            {showCareTile && (
              <ChoiceTile icon={CalendarHeart} title="Rendez-vous pastoral" href="/care/request?from=requests" />
            )}
            {showAccountingTile && (
              <ChoiceTile icon={Wallet} title="Demande comptable" href="/accounting/requests/new?from=requests" />
            )}
          </ChoiceGroup>
        )}
      </div>
    );
  }

  // Step 2: Form
  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
      {/* Retour au choix du type de demande — en édition, il n'y a pas d'étape 1 à regagner */}
      {!isEditMode && (
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="-ml-3 w-fit">
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Changer de type de demande
        </Button>
      )}

      {category === "announcement" && (
        <>
          <Input
            label="Titre"
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            required
            placeholder="Ex : Concert de louange"
          />
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Contenu</label>
            <textarea
              value={annContent}
              onChange={(e) => setAnnContent(e.target.value)}
              required
              rows={4}
              placeholder="Texte de l'annonce…"
              className={textareaClasses()}
            />
          </div>
          <Input
            label="Date de l'événement (facultatif)"
            type="date"
            value={annEventDate}
            onChange={(e) => setAnnEventDate(e.target.value)}
          />
          <div className="flex flex-wrap gap-x-6">
            <label className={checkRow}>
              <Checkbox
                checked={annChannelInterne}
                onChange={(e) => {
                  setAnnChannelInterne(e.target.checked);
                  if (!e.target.checked) setAnnTargetEventIds([]);
                }}
              />
              Diffusion interne
            </label>
            <label className={checkRow}>
              <Checkbox
                checked={annChannelExterne}
                onChange={(e) => setAnnChannelExterne(e.target.checked)}
              />
              Réseaux sociaux
            </label>
            <label className={checkRow}>
              <Checkbox
                checked={annIsUrgent}
                onChange={(e) => setAnnIsUrgent(e.target.checked)}
              />
              Urgent
            </label>
          </div>
          {annChannelInterne && (
            <div className="flex flex-col gap-2">
              <label className={fieldLabelClasses}>
                Dimanches de diffusion
                {annTargetEventIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-brand-text">
                    {annTargetEventIds.length} sélectionné{annTargetEventIds.length > 1 ? "s" : ""}
                  </span>
                )}
              </label>
              {announcementEvents.length === 0 ? (
                <Alert tone="warning">
                  Aucun événement ouvert à la diffusion dans les 90 prochains jours.{" "}
                  <Link href="/admin/events" className="font-semibold text-brand-text underline">Configurer les événements</Link>
                </Alert>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {announcementEvents.map((e) => {
                      const selected = annTargetEventIds.includes(e.id);
                      const date = new Date(e.date);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => toggleEvent(e.id)}
                          aria-pressed={selected}
                          className={`min-h-10 rounded-full border px-3 text-sm font-semibold transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                            selected
                              ? "border-brand bg-brand-soft text-brand-text"
                              : "border-control-line bg-surface text-ink-muted hover:border-brand hover:text-ink"
                          }`}
                        >
                          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          {" · "}
                          {e.title}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[13px] leading-[18px] text-ink-muted">Idéal : 2 à 3 dimanches.</p>
                </>
              )}
            </div>
          )}
          {!isEditMode && sourceOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabelClasses}>Département</label>
              <select
                value={annSourceId}
                onChange={(e) => setAnnSourceId(e.target.value)}
                className={selectControl}
              >
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {category === "visual" && (
        <>
          <Input
            label="Titre"
            value={visualTitle}
            onChange={(e) => setVisualTitle(e.target.value)}
            required
            placeholder="Ex : Bannière formation leaders"
          />
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Brief</label>
            <textarea
              value={visualBrief}
              onChange={(e) => setVisualBrief(e.target.value)}
              rows={4}
              placeholder="Description du besoin, couleurs, texte à inclure…"
              className={textareaClasses()}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Format</label>
            <select
              value={visualFormat}
              onChange={(e) => setVisualFormat(e.target.value)}
              className={selectControl}
            >
              <option value="">— Sélectionner —</option>
              {VISUAL_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <Input
            label="Échéance souhaitée"
            type="date"
            value={visualDeadline}
            onChange={(e) => setVisualDeadline(e.target.value)}
          />
          {visualDeadline && new Date(visualDeadline + "T23:59:59").getTime() < Date.now() + 48 * 60 * 60 * 1000 && (
            <Alert tone="warning" title="Délai inférieur à 48 h.">
              Le traitement de cette demande n&apos;est pas garanti et reste à la discrétion de la Production Média.
            </Alert>
          )}
          {sourceOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabelClasses}>Département</label>
              <select
                value={visualSourceId}
                onChange={(e) => setVisualSourceId(e.target.value)}
                className={selectControl}
              >
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {demandType === "AJOUT_EVENEMENT" && (
        <>
          <Input
            label="Titre de l'événement"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            required
            placeholder="Ex : Culte de louange"
          />
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className={selectControl}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <Input
            label="Date"
            type="datetime-local"
            value={eventDate}
            onChange={(e) => {
              const newDate = e.target.value;
              setEventDate(newDate);
              if (deadlineOffset && newDate) {
                setPlanningDeadline(computeDeadlineFromOffset(newDate, deadlineOffset));
              }
            }}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Délai avant l&apos;événement</label>
            <select
              value={deadlineOffset}
              onChange={(e) => {
                const offset = e.target.value;
                setDeadlineOffset(offset);
                if (offset && eventDate) {
                  setPlanningDeadline(computeDeadlineFromOffset(eventDate, offset));
                } else if (!offset) {
                  setPlanningDeadline("");
                }
              }}
              className={selectControl}
            >
              {DEADLINE_OFFSETS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {!deadlineOffset && (
            <Input
              label="Échéance du planning (facultatif)"
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => setPlanningDeadline(e.target.value)}
            />
          )}
          {deadlineOffset && planningDeadline && (
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Échéance calculée : {new Date(planningDeadline).toLocaleString("fr-FR")}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Départements en service</label>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Cochez les départements qui doivent participer à cet événement.
            </p>
            <div className={listBox}>
              {departments.map((d) => (
                <label key={d.id} className={checkRow}>
                  <Checkbox
                    checked={eventDeptIds.includes(d.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEventDeptIds((prev) => [...prev, d.id]);
                      } else {
                        setEventDeptIds((prev) => prev.filter((id) => id !== d.id));
                      }
                    }}
                  />
                  <span>
                    {d.name}
                    <span className="ml-1 text-ink-muted">({d.ministryName})</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              {eventDeptIds.length} département{eventDeptIds.length !== 1 ? "s" : ""} sélectionné{eventDeptIds.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Récurrence</label>
            <select
              value={recurrenceRule}
              onChange={(e) => {
                setRecurrenceRule(e.target.value);
                if (!e.target.value) setRecurrenceEnd("");
              }}
              className={selectControl}
            >
              {RECURRENCE_RULES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {recurrenceRule && (
            <Input
              label="Fin de récurrence"
              type="date"
              value={recurrenceEnd}
              onChange={(e) => setRecurrenceEnd(e.target.value)}
              required
            />
          )}
        </>
      )}

      {demandType === "MODIFICATION_EVENEMENT" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Événement à modifier</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedEventId(id);
                const evt = events.find((ev) => ev.id === id);
                if (evt) {
                  setEventType(evt.type);
                  // Format ISO date to datetime-local format (YYYY-MM-DDTHH:mm)
                  const d = new Date(evt.date);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  setEventDate(local);
                } else {
                  setEventType("");
                  setEventDate("");
                }
              }}
              required
              className={selectControl}
            >
              <option value="">— Sélectionner —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.date).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Nouveau titre (laisser vide si inchangé)"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Nouveau titre…"
          />
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Nouveau type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className={selectControl}
            >
              <option value="">— Inchangé —</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Nouvelle date</label>
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={fieldControl}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Échéance du planning</label>
            <input
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => setPlanningDeadline(e.target.value)}
              className={fieldControl}
            />
          </div>
        </>
      )}

      {demandType === "ANNULATION_EVENEMENT" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Événement à annuler</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              required
              className={selectControl}
            >
              <option value="">— Sélectionner —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.date).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Raison</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className={textareaClasses()}
            />
          </div>
        </>
      )}

      {demandType === "MODIFICATION_PLANNING" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Événement</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedEventId(id);
                if (id) loadEventDepartments(id);
                else setPlanningDeptIds([]);
              }}
              required
              className={selectControl}
            >
              <option value="">— Sélectionner —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.date).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>
          {selectedEventId && (
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabelClasses}>
                Départements assignés
                {loadingEventDepts && (
                  <span className="ml-2 text-xs font-normal text-ink-muted">Chargement…</span>
                )}
              </label>
              <p className="text-[13px] leading-[18px] text-ink-muted">
                Cochez les départements qui doivent participer à cet événement.
              </p>
              <div className={listBox}>
                {departments.map((d) => (
                  <label key={d.id} className={checkRow}>
                    <Checkbox
                      checked={planningDeptIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPlanningDeptIds((prev) => [...prev, d.id]);
                        } else {
                          setPlanningDeptIds((prev) => prev.filter((id) => id !== d.id));
                        }
                      }}
                    />
                    <span>
                      {d.name}
                      <span className="ml-1 text-ink-muted">({d.ministryName})</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[13px] leading-[18px] text-ink-muted">
                {planningDeptIds.length} département{planningDeptIds.length !== 1 ? "s" : ""} sélectionné{planningDeptIds.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </>
      )}

      {demandType === "DEMANDE_ACCES" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Utilisateur</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
              className={selectControl}
            >
              <option value="">— Sélectionner —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={fieldLabelClasses}>Rôle</label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              required
              className={selectControl}
            >
              {ROLES_FOR_ACCESS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {targetRole === "MINISTER" && (
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabelClasses}>Ministère</label>
              <select
                value={targetMinistryId}
                onChange={(e) => setTargetMinistryId(e.target.value)}
                required
                className={selectControl}
              >
                <option value="">— Sélectionner —</option>
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          {targetRole === "DEPARTMENT_HEAD" && (
            <div className="flex flex-col gap-1.5">
              <label className={fieldLabelClasses}>Départements</label>
              <div className={`${listBox} max-h-48`}>
                {departments.map((d) => (
                  <label key={d.id} className={checkRow}>
                    <Checkbox
                      checked={targetDeptIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetDeptIds((prev) => [...prev, d.id]);
                        } else {
                          setTargetDeptIds((prev) => prev.filter((id) => id !== d.id));
                        }
                      }}
                    />
                    {d.name} ({d.ministryName})
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && <Alert tone="danger" role="alert">{error}</Alert>}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Envoi…" : isEditMode ? "Enregistrer" : "Envoyer la demande"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => isEditMode ? router.push("/requests") : reset()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
