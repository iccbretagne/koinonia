"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type RequestCategory = "announcement" | "demand" | null;
type DemandType =
  | "AJOUT_EVENEMENT"
  | "MODIFICATION_EVENEMENT"
  | "ANNULATION_EVENEMENT"
  | "MODIFICATION_PLANNING"
  | "DEMANDE_ACCES";

interface Props {
  churchId: string;
  canSubmitDemands: boolean;
  events: { id: string; title: string; type: string; date: string }[];
  sourceOptions: { type: "department" | "ministry"; id: string; label: string }[];
  departments: { id: string; name: string; ministryName: string }[];
  users: { id: string; label: string }[];
  ministries: { id: string; name: string }[];
}

const DEMAND_TYPES: { key: DemandType; label: string; icon: string }[] = [
  { key: "AJOUT_EVENEMENT", label: "Ajout événement", icon: "📅" },
  { key: "MODIFICATION_EVENEMENT", label: "Modification événement", icon: "✏️" },
  { key: "ANNULATION_EVENEMENT", label: "Annulation événement", icon: "❌" },
  { key: "MODIFICATION_PLANNING", label: "Modification planning", icon: "📋" },
  { key: "DEMANDE_ACCES", label: "Demande d'accès", icon: "🔑" },
];

const EVENT_TYPES = ["CULTE", "PRIERE", "REUNION", "FORMATION", "EVENEMENT", "AUTRE"];

const ROLES_FOR_ACCESS = [
  { value: "MINISTER", label: "Ministre" },
  { value: "DEPARTMENT_HEAD", label: "Responsable de département" },
  { value: "DISCIPLE_MAKER", label: "Faiseur de disciples" },
  { value: "REPORTER", label: "Reporter" },
];

export default function RequestForm({
  churchId,
  canSubmitDemands,
  events,
  sourceOptions,
  departments,
  users,
  ministries,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<RequestCategory>(null);
  const [demandType, setDemandType] = useState<DemandType | null>(null);

  // Announcement fields
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [annEventDate, setAnnEventDate] = useState("");
  const [annIsUrgent, setAnnIsUrgent] = useState(false);
  const [annChannelInterne, setAnnChannelInterne] = useState(true);
  const [annChannelExterne, setAnnChannelExterne] = useState(false);
  const [annSourceId, setAnnSourceId] = useState(sourceOptions[0]?.id ?? "");
  const [annTargetEventIds, setAnnTargetEventIds] = useState<string[]>([]);

  function toggleEvent(id: string) {
    setAnnTargetEventIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Demand fields
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("CULTE");
  const [eventDate, setEventDate] = useState("");
  const [planningDeadline, setPlanningDeadline] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [reason, setReason] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState("MINISTER");
  const [targetMinistryId, setTargetMinistryId] = useState("");
  const [targetDeptIds, setTargetDeptIds] = useState<string[]>([]);

  // Members for planning modification (loaded dynamically)
  const [members, setMembers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);

  async function loadMembers(deptId: string) {
    if (!deptId) return;
    try {
      const res = await fetch(`/api/members?churchId=${churchId}&departmentId=${deptId}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.data ?? []);
      }
    } catch {
      // ignore
    }
  }

  function reset() {
    setCategory(null);
    setDemandType(null);
    setError(null);
  }

  async function submitAnnouncement() {
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
        payload = { eventTitle, eventType, eventDate, planningDeadline: planningDeadline || null };
        break;
      case "MODIFICATION_EVENEMENT": {
        const evt = events.find((e) => e.id === selectedEventId);
        title = `Modification : ${evt?.title ?? "événement"}`;
        payload = { eventId: selectedEventId, changes: { title: eventTitle || undefined } };
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
        title = `Modif. planning : ${evt3?.title ?? "événement"}`;
        payload = {
          eventId: selectedEventId,
          departmentId: selectedDeptId,
          memberId: selectedMemberId,
          newStatus: newStatus || null,
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

  // Step 1: Choose category
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
      <button
        type="button"
        onClick={reset}
        className="text-sm text-icc-violet hover:underline mb-2"
      >
        ← Changer de type
      </button>

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
          {sourceOptions.length > 1 && (
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
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Input
            label="Date"
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
          <Input
            label="Deadline planning (optionnel)"
            type="datetime-local"
            value={planningDeadline}
            onChange={(e) => setPlanningDeadline(e.target.value)}
          />
        </>
      )}

      {demandType === "MODIFICATION_EVENEMENT" && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Événement à modifier</label>
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
          <Input
            label="Nouveau titre (laisser vide si inchangé)"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Nouveau titre..."
          />
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
            <label className="block text-sm font-medium text-gray-700">Département</label>
            <select
              value={selectedDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                loadMembers(e.target.value);
              }}
              required
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              <option value="">— Sélectionner —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.ministryName})
                </option>
              ))}
            </select>
          </div>
          {members.length > 0 && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Membre</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                required
                className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
              >
                <option value="">— Sélectionner —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nouveau statut</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
            >
              <option value="">Non planifié</option>
              <option value="EN_SERVICE">En service</option>
              <option value="EN_SERVICE_DEBRIEF">En service (debrief)</option>
              <option value="INDISPONIBLE">Indisponible</option>
              <option value="REMPLACANT">Remplaçant</option>
            </select>
          </div>
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
          {submitting ? "Envoi..." : "Soumettre"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/requests")}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
