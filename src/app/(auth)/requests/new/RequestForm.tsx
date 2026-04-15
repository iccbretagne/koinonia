"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/event-types";

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
  churchId: string;
  canSubmitDemands: boolean;
  events: { id: string; title: string; type: string; date: string }[];
  sourceOptions: { type: "department" | "ministry"; id: string; label: string }[];
  departments: { id: string; name: string; ministryName: string }[];
  users: { id: string; label: string }[];
  ministries: { id: string; name: string }[];
  editData?: EditData;
}

const DEMAND_TYPES: { key: DemandType; label: string; icon: string }[] = [
  { key: "AJOUT_EVENEMENT", label: "Ajout événement", icon: "📅" },
  { key: "MODIFICATION_EVENEMENT", label: "Modification événement", icon: "✏️" },
  { key: "ANNULATION_EVENEMENT", label: "Annulation événement", icon: "❌" },
  { key: "MODIFICATION_PLANNING", label: "Modification planning", icon: "📋" },
  { key: "DEMANDE_ACCES", label: "Demande d'accès", icon: "🔑" },
];

const DEMAND_TYPE_KEYS = DEMAND_TYPES.map((d) => d.key) as string[];

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

const ROLES_FOR_ACCESS = [
  { value: "MINISTER", label: "Ministre" },
  { value: "DEPARTMENT_HEAD", label: "Responsable de département" },
  { value: "DISCIPLE_MAKER", label: "Faiseur de disciples" },
  { value: "REPORTER", label: "Reporter" },
];

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
  events,
  sourceOptions,
  departments,
  users,
  ministries,
  editData,
}: Props) {
  const router = useRouter();
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

  async function handleSubmit(e: React.FormEvent) {
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
      <div className="max-w-2xl">
        <p className="text-sm text-gray-600 mb-6">Que souhaitez-vous faire ?</p>

        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Annonces</h3>
        <button
          onClick={() => setCategory("announcement")}
          className="w-full text-left bg-white rounded-lg shadow p-4 border-2 border-transparent hover:border-icc-violet/40 transition-colors mb-6"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📢</span>
            <div>
              <p className="font-semibold text-gray-900">Diffuser une annonce</p>
              <p className="text-xs text-gray-500">Demander la diffusion interne et/ou sur les réseaux sociaux</p>
            </div>
          </div>
        </button>

        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Médias</h3>
        <button
          onClick={() => setCategory("visual")}
          className="w-full text-left bg-white rounded-lg shadow p-4 border-2 border-transparent hover:border-icc-violet/40 transition-colors mb-6"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎨</span>
            <div>
              <p className="font-semibold text-gray-900">Demander un visuel</p>
              <p className="text-xs text-gray-500">Commande directe à la Production Média, sans lien avec une annonce</p>
            </div>
          </div>
        </button>

        {canSubmitDemands && (
          <>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Demandes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMAND_TYPES.map((dt) => (
                <button
                  key={dt.key}
                  onClick={() => {
                    setCategory("demand");
                    setDemandType(dt.key);
                  }}
                  className="text-left bg-white rounded-lg shadow p-4 border-2 border-transparent hover:border-icc-violet/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{dt.icon}</span>
                    <p className="font-medium text-gray-900 text-sm">{dt.label}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Step 2: Form
  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">

      {category === "announcement" && (
        <>
          <Input
            label="Titre"
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            required
            placeholder="Ex : Concert de louange"
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Contenu</label>
            <textarea
              value={annContent}
              onChange={(e) => setAnnContent(e.target.value)}
              required
              rows={4}
              placeholder="Texte de l'annonce..."
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            />
          </div>
          <Input
            label="Date de l'événement (optionnel)"
            type="date"
            value={annEventDate}
            onChange={(e) => setAnnEventDate(e.target.value)}
          />
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={annChannelInterne}
                onChange={(e) => {
                  setAnnChannelInterne(e.target.checked);
                  if (!e.target.checked) setAnnTargetEventIds([]);
                }}
                className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
              />
              Diffusion interne
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={annChannelExterne}
                onChange={(e) => setAnnChannelExterne(e.target.checked)}
                className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
              />
              Réseaux sociaux
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={annIsUrgent}
                onChange={(e) => setAnnIsUrgent(e.target.checked)}
                className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
              />
              Urgent
            </label>
          </div>
          {annChannelInterne && events.filter((e) => new Date(e.date) >= new Date()).length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Dimanches de diffusion</label>
              <div className="space-y-2 border-2 border-gray-200 rounded-lg p-3">
                {events
                  .filter((e) => new Date(e.date) >= new Date())
                  .map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={annTargetEventIds.includes(e.id)}
                        onChange={() => toggleEvent(e.id)}
                        className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                      />
                      {e.title} — {new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </label>
                  ))}
              </div>
              <p className="text-xs text-gray-500">Idéal : 2 à 3 dimanches.</p>
            </div>
          )}
          {!isEditMode && sourceOptions.length > 1 && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Source</label>
              <select
                value={annSourceId}
                onChange={(e) => setAnnSourceId(e.target.value)}
                className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Brief</label>
            <textarea
              value={visualBrief}
              onChange={(e) => setVisualBrief(e.target.value)}
              rows={4}
              placeholder="Description du besoin, couleurs, texte à inclure..."
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Format</label>
            <select
              value={visualFormat}
              onChange={(e) => setVisualFormat(e.target.value)}
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {VISUAL_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <Input
            label="Deadline souhaitée"
            type="date"
            value={visualDeadline}
            onChange={(e) => setVisualDeadline(e.target.value)}
          />
          {sourceOptions.length > 1 && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Source</label>
              <select
                value={visualSourceId}
                onChange={(e) => setVisualSourceId(e.target.value)}
                className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Délai avant l&apos;événement</label>
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
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              {DEADLINE_OFFSETS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {!deadlineOffset && (
            <Input
              label="Deadline planning (optionnel)"
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => setPlanningDeadline(e.target.value)}
            />
          )}
          {deadlineOffset && planningDeadline && (
            <p className="text-xs text-gray-500">
              Deadline calculée : {new Date(planningDeadline).toLocaleString("fr-FR")}
            </p>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Départements en service</label>
            <p className="text-xs text-gray-500 mb-2">
              Cochez les départements qui doivent participer à cet événement.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto border-2 border-gray-200 rounded-lg p-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={eventDeptIds.includes(d.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEventDeptIds((prev) => [...prev, d.id]);
                      } else {
                        setEventDeptIds((prev) => prev.filter((id) => id !== d.id));
                      }
                    }}
                    className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                  />
                  <span>
                    {d.name}
                    <span className="text-gray-400 ml-1">({d.ministryName})</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {eventDeptIds.length} département{eventDeptIds.length !== 1 ? "s" : ""} sélectionné{eventDeptIds.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Récurrence</label>
            <select
              value={recurrenceRule}
              onChange={(e) => {
                setRecurrenceRule(e.target.value);
                if (!e.target.value) setRecurrenceEnd("");
              }}
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Événement à modifier</label>
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
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
            placeholder="Nouveau titre..."
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nouveau type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="block w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            >
              <option value="">— Inchangé —</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nouvelle date</label>
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="block w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Deadline planning</label>
            <input
              type="datetime-local"
              value={planningDeadline}
              onChange={(e) => setPlanningDeadline(e.target.value)}
              className="block w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-icc-violet"
            />
          </div>
        </>
      )}

      {demandType === "ANNULATION_EVENEMENT" && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Événement à annuler</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              required
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {new Date(e.date).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Raison</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            />
          </div>
        </>
      )}

      {demandType === "MODIFICATION_PLANNING" && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Événement</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedEventId(id);
                if (id) loadEventDepartments(id);
                else setPlanningDeptIds([]);
              }}
              required
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
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
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Départements assignés
                {loadingEventDepts && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">Chargement...</span>
                )}
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Cochez les départements qui doivent participer à cet événement.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto border-2 border-gray-200 rounded-lg p-3">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={planningDeptIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPlanningDeptIds((prev) => [...prev, d.id]);
                        } else {
                          setPlanningDeptIds((prev) => prev.filter((id) => id !== d.id));
                        }
                      }}
                      className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                    />
                    <span>
                      {d.name}
                      <span className="text-gray-400 ml-1">({d.ministryName})</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                {planningDeptIds.length} département{planningDeptIds.length !== 1 ? "s" : ""} sélectionné{planningDeptIds.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </>
      )}

      {demandType === "DEMANDE_ACCES" && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Utilisateur</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Rôle</label>
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              required
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              {ROLES_FOR_ACCESS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {targetRole === "MINISTER" && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Ministère</label>
              <select
                value={targetMinistryId}
                onChange={(e) => setTargetMinistryId(e.target.value)}
                required
                className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
              >
                <option value="">— Sélectionner —</option>
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          {targetRole === "DEPARTMENT_HEAD" && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Départements</label>
              <div className="space-y-2 max-h-48 overflow-y-auto border-2 border-gray-200 rounded-lg p-3">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={targetDeptIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetDeptIds((prev) => [...prev, d.id]);
                        } else {
                          setTargetDeptIds((prev) => prev.filter((id) => id !== d.id));
                        }
                      }}
                      className="rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                    />
                    {d.name} ({d.ministryName})
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-icc-rouge">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Envoi..." : isEditMode ? "Enregistrer" : "Soumettre"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => isEditMode ? router.push("/requests") : reset()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
