"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { EVENT_TYPE_OPTIONS, getEventTypeLabel } from "@/lib/event-types";

interface DayEvent {
  id: string;
  title: string;
  date: string;
  hasAudioService: boolean;
}

export interface ServiceInfo {
  id: string;
  title: string | null;
  speaker: string | null;
  serviceDate: string;
  type: string;
  planningEventId: string | null;
  planningEventTitle: string | null;
}

export default function ServiceInfoEditor({ service }: { service: ServiceInfo }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(service.serviceDate.slice(0, 10));
  const [eventId, setEventId] = useState(service.planningEventId ?? "");
  const [title, setTitle] = useState(service.title ?? "");
  const [speaker, setSpeaker] = useState(service.speaker ?? "");
  const [type, setType] = useState(service.type);
  const [dayEvents, setDayEvents] = useState<DayEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un événement rattaché impose son type (dérivé côté serveur) — lecture seule dans ce cas.
  const linkedToEvent = !!eventId;

  useEffect(() => {
    if (!editing) return;
    fetch(`/api/audio/services/events?date=${date}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: DayEvent[]) => setDayEvents(data))
      .catch(() => setDayEvents([]));
  }, [editing, date]);

  // L'événement déjà rattaché peut ne pas être dans le jour affiché (date différente de la
  // date de l'événement, ou rattachement fait après coup) — sans l'ajouter explicitement,
  // changer la date le ferait disparaître de la liste et le désélectionnerait au premier
  // enregistrement.
  const options = [...dayEvents];
  if (service.planningEventId && !options.some((e) => e.id === service.planningEventId)) {
    options.unshift({
      id: service.planningEventId,
      title: service.planningEventTitle ?? "Événement rattaché",
      date: service.serviceDate,
      hasAudioService: true,
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/audio/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          speaker: speaker.trim() || undefined,
          serviceDate: new Date(date).toISOString(),
          planningEventId: eventId || null,
          type: linkedToEvent ? undefined : type || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Échec de l'enregistrement");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {service.title ||
              service.planningEventTitle ||
              new Date(service.serviceDate).toLocaleDateString("fr-FR")}
          </h1>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          {new Date(service.serviceDate).toLocaleDateString("fr-FR")}
          {" · "}
          {getEventTypeLabel(service.type)}
          {service.speaker && <span> · {service.speaker}</span>}
          {service.planningEventTitle && <span> · {service.planningEventTitle}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 border-2 border-gray-200 rounded-lg p-4 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Input label="Date du culte" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Select
        label="Événement"
        placeholder="Aucun — saisie libre"
        value={eventId}
        onChange={(e) => {
          setEventId(e.target.value);
          const evt = options.find((d) => d.id === e.target.value);
          if (evt) setTitle(evt.title);
        }}
        options={options.map((e) => {
          const label = `${e.title} — ${new Date(e.date).toLocaleDateString("fr-FR")}`;
          return {
            value: e.id,
            label: e.hasAudioService && e.id !== service.planningEventId ? `${label} (déjà déposé)` : label,
          };
        })}
      />
      <Select
        label="Type de rassemblement"
        value={type}
        onChange={(e) => setType(e.target.value)}
        options={EVENT_TYPE_OPTIONS}
        disabled={linkedToEvent}
        placeholder={linkedToEvent ? "Déterminé par l'événement rattaché" : "Sélectionner..."}
      />
      <Input label="Titre du message" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input label="Orateur" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
