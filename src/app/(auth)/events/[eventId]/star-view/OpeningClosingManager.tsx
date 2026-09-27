"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Alert from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { controlClasses } from "@/components/ui/field-classes";

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
  readonly eventId: string;
  readonly data: OpeningClosingData;
  readonly onChange: (data: OpeningClosingData) => void;
  /** Retire la carte propre (fond, ombre, marge) quand le composant est inséré dans un
   * conteneur qui gère déjà cette présentation (ex. PreparationBanner, spec 043). */
  readonly embedded?: boolean;
}

const SLOT_LABELS: Record<"OPENING" | "CLOSING", string> = {
  OPENING: "Ouverture",
  CLOSING: "Fermeture",
};

function SlotList({
  label,
  assignments,
  onRemove,
  removingId,
}: {
  readonly label: string;
  readonly assignments: Assignment[];
  readonly onRemove?: (id: string) => void;
  readonly removingId?: string | null;
}) {
  return (
    <div>
      <h4 className="mb-1 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</h4>
      {assignments.length === 0 ? (
        <span className="text-sm italic text-ink-muted">Non pourvu</span>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-surface-sunken pl-3 pr-1 text-sm font-medium text-ink"
            >
              {a.member.firstName} {a.member.lastName}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  disabled={removingId === a.id}
                  aria-label={`Retirer ${a.member.firstName} ${a.member.lastName}`}
                  title="Retirer"
                  className="grid size-7 place-items-center rounded-full text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45"
                >
                  <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OpeningClosingManager({ eventId, data, onChange, embedded = false }: Props) {
  const toast = useToast();
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
      if (!res.ok) { toast.error(body.error || "Ajout impossible. Réessayez dans un instant."); return; }
      const assignment = { id: body.assignment.id, member: body.assignment.member };
      onChange({
        ...data,
        [slot === "OPENING" ? "opening" : "closing"]: [
          ...data[slot === "OPENING" ? "opening" : "closing"],
          assignment,
        ],
      });
      toast.success(`${assignment.member.firstName} ${assignment.member.lastName} ajouté${slot === "OPENING" ? " à l'ouverture" : " à la fermeture"}`);
      if (body.absenceWarning) {
        setWarning(`Attention : ${assignment.member.firstName} ${assignment.member.lastName} a déclaré une absence à cette date.`);
      }
      setQuery("");
      setResults([]);
    } catch {
      toast.error("Opération impossible. Vérifiez votre connexion.");
    } finally {
      setAdding(false);
    }
  }

  async function removeAssignment(id: string, currentSlot: "OPENING" | "CLOSING") {
    setRemoving(id);
    try {
      const res = await fetch(`/api/events/${eventId}/opening-closing/${id}`, { method: "DELETE" });
      if (!res.ok) { const body = await res.json(); toast.error(body.error || "Retrait impossible. Réessayez dans un instant."); return; }
      const key = currentSlot === "OPENING" ? "opening" : "closing";
      onChange({ ...data, [key]: data[key].filter((a) => a.id !== id) });
      toast.success("Personne retirée");
    } catch {
      toast.error("Opération impossible. Vérifiez votre connexion.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={embedded ? "print:hidden" : "mb-6 rounded-card border border-line bg-surface p-4 print:hidden"}>
      <h2 className={embedded ? "mb-3 font-display text-sm font-semibold text-ink" : "mb-3 font-display text-lg font-semibold text-ink"}>
        Ouverture / Fermeture
      </h2>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["OPENING", "CLOSING"] as const).map((s) => (
          <SlotList
            key={s}
            label={SLOT_LABELS[s]}
            assignments={data[s === "OPENING" ? "opening" : "closing"]}
            onRemove={data.canManage ? (id) => removeAssignment(id, s) : undefined}
            removingId={removing}
          />
        ))}
      </div>

      {data.canManage && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {warning && <Alert tone="warning">{warning}</Alert>}
          <div className="flex flex-wrap items-start gap-2">
            <label className="sr-only" htmlFor={`oc-slot-${eventId}`}>Créneau</label>
            <select
              id={`oc-slot-${eventId}`}
              value={slot}
              onChange={(e) => setSlot(e.target.value as "OPENING" | "CLOSING")}
              className={`${controlClasses()} w-auto cursor-pointer`}
            >
              <option value="OPENING">Ouverture</option>
              <option value="CLOSING">Fermeture</option>
            </select>
            <div className="relative min-w-[180px] flex-1">
              <label className="sr-only" htmlFor={`oc-search-${eventId}`}>Rechercher un membre</label>
              <input
                id={`oc-search-${eventId}`}
                type="search"
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Rechercher un membre…"
                className={controlClasses()}
                disabled={adding}
                autoComplete="off"
              />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-float">
                  {results.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => addMember(m.id)}
                        disabled={adding}
                        className="flex min-h-11 w-full items-center px-3 text-left text-[15px] text-ink hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none disabled:opacity-45"
                      >
                        {m.firstName} {m.lastName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {searching && <span className="text-xs text-ink-muted">Recherche…</span>}
        </div>
      )}
    </div>
  );
}
