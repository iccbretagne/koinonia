"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface TargetEvent {
  id: string;
  title: string;
  date: string;
}

interface SourceOption {
  type: "department" | "ministry";
  id: string;
  label: string;
}

interface Props {
  churchId: string;
  targetEvents: TargetEvent[];
  sourceOptions: SourceOption[];
}

function computeIsSaveTheDate(eventDate: string): boolean {
  if (!eventDate) return false;
  const date = new Date(eventDate);
  const threeWeeksFromNow = new Date();
  threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
  return date > threeWeeksFromNow;
}

function isPastDeadline(): boolean {
  const now = new Date();
  // Tuesday = 2, deadline 23:59
  const day = now.getDay();
  const hour = now.getHours();
  return day > 2 || (day === 2 && hour >= 24);
}

export default function AnnouncementForm({ churchId, targetEvents, sourceOptions }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [channelInterne, setChannelInterne] = useState(false);
  const [channelExterne, setChannelExterne] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [sourceId, setSourceId] = useState(sourceOptions[0]?.id ?? "");

  const saveTheDate = computeIsSaveTheDate(eventDate);
  const lateSubmission = isPastDeadline() && !isUrgent;

  function toggleEvent(id: string) {
    setSelectedEvents((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channelInterne && !channelExterne) {
      setError("Sélectionnez au moins un canal de diffusion.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const source = sourceOptions.find((s) => s.id === sourceId);

    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          title,
          content,
          eventDate: eventDate || null,
          channelInterne,
          channelExterne,
          isUrgent,
          departmentId: source?.type === "department" ? source.id : null,
          ministryId: source?.type === "ministry" ? source.id : null,
          targetEventIds: selectedEvents,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Une erreur est survenue.");
        return;
      }

      router.push("/announcements");
    } catch {
      setError("Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {lateSubmission && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Délai dépassé</strong> — La deadline est le mardi à 23h59. Votre annonce
          sera traitée pour le dimanche suivant, sauf si vous cochez &quot;Urgence&quot;.
        </div>
      )}

      <Input
        label="Titre"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Ex : Concert de Noël"
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Contenu de l&apos;annonce <span className="text-red-500">*</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={5}
          placeholder="Rédigez l'annonce telle qu'elle sera communiquée..."
          className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Département demandeur
        </label>
        {sourceOptions.length === 0 ? (
          <p className="text-sm text-gray-500 italic px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            Aucun département associé — l&apos;annonce sera soumise en votre nom sans département.
          </p>
        ) : sourceOptions.length === 1 ? (
          <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            {sourceOptions[0].label}
          </p>
        ) : (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
          >
            {sourceOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Date de l&apos;événement annoncé
        </label>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="block w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
        />
        {saveTheDate && eventDate && (
          <p className="text-xs text-icc-violet font-medium mt-1">
            📅 Save the Date — l&apos;événement est dans plus de 3 semaines, seule la date sera
            communiquée.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium text-gray-700">
          Canaux de diffusion <span className="text-red-500">*</span>
        </span>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={channelInterne}
            onChange={(e) => setChannelInterne(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
          />
          <span className="text-sm text-gray-700">
            <strong>Interne</strong> — Annonce lors d&apos;un service
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={channelExterne}
            onChange={(e) => setChannelExterne(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
          />
          <span className="text-sm text-gray-700">
            <strong>Externe</strong> — Publication sur les réseaux sociaux
          </span>
        </label>
      </div>

      {channelInterne && targetEvents.length > 0 && (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-gray-700">
            Dimanches de diffusion
          </span>
          <div className="space-y-1 max-h-48 overflow-y-auto border-2 border-gray-200 rounded-lg p-3">
            {targetEvents.map((ev) => (
              <label key={ev.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                  className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                />
                <span className="text-sm text-gray-700">
                  {ev.title} —{" "}
                  {new Date(ev.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                  })}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">Idéal : 2 à 3 dimanches.</p>
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isUrgent}
          onChange={(e) => setIsUrgent(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-icc-rouge focus:ring-icc-rouge"
        />
        <span className="text-sm text-gray-700">
          <strong className="text-icc-rouge">Urgence</strong> — Dépasse la deadline, validé
          par la coordination
        </span>
      </label>

      {error && (
        <p className="text-sm text-icc-rouge">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Envoi en cours..." : "Soumettre l'annonce"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/announcements")}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
