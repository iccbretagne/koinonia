"use client";

import Select from "@/components/ui/Select";
import { EVENT_TYPE_OPTIONS } from "@/lib/event-types";

export interface DayEvent {
  id: string;
  title: string;
  date: string;
  hasAudioService: boolean;
}

interface Props {
  readonly events: DayEvent[];
  readonly eventId: string;
  /** Événement choisi (`undefined` pour la saisie libre). */
  readonly onEventChange: (eventId: string, event: DayEvent | undefined) => void;
  readonly eventPlaceholder: string;
  /** Événement déjà rattaché au culte édité : pas marqué « déjà déposé ». */
  readonly currentEventId?: string | null;
  readonly type: string;
  readonly onTypeChange: (type: string) => void;
}

/**
 * Rattachement d'un enregistrement à un événement du planning, et son type de rassemblement
 * (imposé par l'événement rattaché, libre sinon).
 */
export default function ServiceEventFields({
  events,
  eventId,
  onEventChange,
  eventPlaceholder,
  currentEventId,
  type,
  onTypeChange,
}: Props) {
  const linkedToEvent = eventId !== "";
  return (
    <>
      <Select
        label="Événement"
        placeholder={eventPlaceholder}
        value={eventId}
        onChange={(e) => onEventChange(e.target.value, events.find((d) => d.id === e.target.value))}
        options={events.map((e) => {
          const label = `${e.title} — ${new Date(e.date).toLocaleDateString("fr-FR")}`;
          const taken = e.hasAudioService && e.id !== currentEventId;
          return { value: e.id, label: taken ? `${label} (déjà déposé)` : label };
        })}
      />
      <Select
        label="Type de rassemblement"
        value={type}
        onChange={(e) => onTypeChange(e.target.value)}
        options={EVENT_TYPE_OPTIONS}
        disabled={linkedToEvent}
        placeholder={linkedToEvent ? "Déterminé par l'événement rattaché" : "Sélectionner..."}
      />
    </>
  );
}
