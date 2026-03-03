"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface Event {
  id: string;
  title: string;
  type: string;
  date: string;
}

interface EventSelectorProps {
  events: Event[];
  selectedEventId: string | null;
  selectedDeptId: string | null;
}

export default function EventSelector({
  events,
  selectedEventId,
  selectedDeptId,
}: EventSelectorProps) {
  const router = useRouter();

  // Auto-select the next upcoming event on first render
  useEffect(() => {
    if (!selectedEventId && events.length > 0 && selectedDeptId) {
      const now = new Date();
      const upcoming = events.find((e) => new Date(e.date) >= now);
      const eventId = (upcoming || events[0]).id;
      router.replace(`/dashboard?dept=${selectedDeptId}&event=${eventId}`);
    }
  }, [selectedEventId, events, selectedDeptId, router]);

  const handleChange = (eventId: string) => {
    const params = new URLSearchParams();
    if (selectedDeptId) params.set("dept", selectedDeptId);
    if (eventId) params.set("event", eventId);
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div>
      <label className="block mb-1 text-sm font-medium text-gray-700">
        Evenement
      </label>
      <select
        value={selectedEventId || ""}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full px-3 py-2.5 md:py-2 text-base md:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-icc-violet"
      >
        <option value="" disabled>
          Choisir un evenement
        </option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title} (
            {new Date(event.date).toLocaleDateString("fr-FR")})
          </option>
        ))}
      </select>
    </div>
  );
}
