"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERSONAS, PERSONA_NAME } from "@/modules/assistant/schemas";
import AssistantAvatar, { type AssistantPersonaKey } from "./AssistantAvatar";

/**
 * Choix du personnage de l'assistant dans « Mon profil » (spec 075) : préférence du compte,
 * retrouvée sur tous ses appareils. Nia par défaut.
 */
export default function PersonaSelector({ initial }: { readonly initial: AssistantPersonaKey }) {
  const router = useRouter();
  const [persona, setPersona] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function choose(value: AssistantPersonaKey) {
    if (value === persona || saving) return;
    const previous = persona;
    setPersona(value);
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/assistant/persona", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setPersona(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Personnage de l'assistant" className="flex flex-wrap gap-2">
        {PERSONAS.map((value) => {
          const active = persona === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={saving}
              onClick={() => void choose(value)}
              className={`flex min-h-11 items-center gap-3 rounded-card border px-3 py-2 font-display text-[15px] font-semibold transition-colors
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  active ? "border-brand bg-brand-soft text-brand-text" : "border-line bg-surface text-ink hover:bg-surface-sunken"
                }`}
            >
              <AssistantAvatar persona={value} expression="icone" size={40} decorative float={false} />
              {PERSONA_NAME[value]}
              {value === "NIA" && <span className="text-[13px] font-normal text-ink-muted">(par défaut)</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[13px] text-danger">Le choix n&apos;a pas pu être enregistré. Réessayez.</p>}
    </div>
  );
}
