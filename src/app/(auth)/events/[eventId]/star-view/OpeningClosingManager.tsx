"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

interface Assignment {
  id: string;
  member: Member;
}

export interface OpeningClosingData {
  opening: Assignment[];
  closing: Assignment[];
  canManage: boolean;
}

interface Props {
  eventId: string;
  data: OpeningClosingData;
  onChange: (data: OpeningClosingData) => void;
  /** Retire la carte propre (fond, ombre, marge) quand le composant est inséré dans un
   * conteneur qui gère déjà cette présentation (ex. PreparationBanner, spec 043). */
  embedded?: boolean;
}

const SLOT_LABELS: Record<"OPENING" | "CLOSING", string> = {
  OPENING: "Ouverture",
  CLOSING: "Fermeture",
};

function SlotList({ label, assignments }: { label: string; assignments: Assignment[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</h4>
      {assignments.length === 0 ? (
        <span className="text-sm italic text-gray-400">Non pourvu</span>
      ) : (
        <ul className="space-y-1">
          {assignments.map((a) => (
            <li key={a.id} className="text-sm text-gray-700">
              {a.member.firstName} {a.member.lastName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OpeningClosingManager({ eventId, data, onChange, embedded = false }: Props) {
  const [slot, setSlot] = useState<"OPENING" | "CLOSING">("OPENING");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/events/${eventId}/opening-closing/members?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  async function addMember(memberId: string) {
    setAdding(true);
    setWarning(null);
    try {
      const res = await fetch(`/api/events/${eventId}/opening-closing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, memberId }),
      });
      const body = await res.json();
      if (!res.ok) { alert(body.error || "Erreur"); return; }
      const assignment = { id: body.assignment.id, member: body.assignment.member };
      onChange({
        ...data,
        [slot === "OPENING" ? "opening" : "closing"]: [
          ...data[slot === "OPENING" ? "opening" : "closing"],
          assignment,
        ],
      });
      if (body.absenceWarning) {
        setWarning(`Attention : ${assignment.member.firstName} ${assignment.member.lastName} a déclaré une absence à cette date.`);
      }
      setQuery("");
      setResults([]);
    } catch {
      alert("Erreur");
    } finally {
      setAdding(false);
    }
  }

  async function removeAssignment(id: string, currentSlot: "OPENING" | "CLOSING") {
    setRemoving(id);
    try {
      const res = await fetch(`/api/events/${eventId}/opening-closing/${id}`, { method: "DELETE" });
      if (!res.ok) { const body = await res.json(); alert(body.error || "Erreur"); return; }
      const key = currentSlot === "OPENING" ? "opening" : "closing";
      onChange({ ...data, [key]: data[key].filter((a) => a.id !== id) });
    } catch {
      alert("Erreur");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={embedded ? "print:hidden" : "mb-6 p-4 bg-white rounded-lg shadow print:hidden"}>
      <h2 className={embedded ? "text-sm font-semibold text-gray-700 mb-3" : "text-lg font-semibold text-gray-900 mb-3"}>
        Ouverture / Fermeture
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {(["OPENING", "CLOSING"] as const).map((s) => (
          <div key={s}>
            <SlotList label={SLOT_LABELS[s]} assignments={data[s === "OPENING" ? "opening" : "closing"]} />
            {data.canManage && data[s === "OPENING" ? "opening" : "closing"].map((a) => (
              <Button
                key={a.id}
                variant="danger"
                size="sm"
                onClick={() => removeAssignment(a.id, s)}
                disabled={removing === a.id}
                className="mt-1"
              >
                Retirer {a.member.firstName} {a.member.lastName}
              </Button>
            ))}
          </div>
        ))}
      </div>

      {data.canManage && (
        <div className="border-t border-gray-100 pt-4">
          {warning && (
            <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {warning}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value as "OPENING" | "CLOSING")}
              className="border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
            >
              <option value="OPENING">Ouverture</option>
              <option value="CLOSING">Fermeture</option>
            </select>
            <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Rechercher un membre..."
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet"
                disabled={adding}
              />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {results.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => addMember(m.id)}
                        disabled={adding}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        {m.firstName} {m.lastName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searching && <span className="text-xs text-gray-400">Recherche...</span>}
          </div>
        </div>
      )}
    </div>
  );
}
