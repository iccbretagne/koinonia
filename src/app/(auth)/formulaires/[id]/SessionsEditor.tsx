"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, IconButton, Input, Select } from "@/components/ui";
import { useApi } from "../use-api";

export interface EditorLevel {
  id: string;
  code: string;
  label: string | null;
  capacity: number;
  isEntry: boolean;
}
export interface EditorSession {
  id: string;
  label: string;
  startDate: string;
  days: number;
  levels: EditorLevel[];
}

interface LevelDraft {
  key: string;
  code: string;
  label: string;
  capacity: string;
  isEntry: boolean;
}
interface SessionDraft {
  key: string;
  label: string;
  startDate: string;
  days: "1" | "2";
  levels: LevelDraft[];
}

let seq = 0;
const tempKey = () => `new-${Date.now().toString(36)}-${++seq}`;

const toDraft = (s: EditorSession): SessionDraft => ({
  key: s.id,
  label: s.label,
  startDate: s.startDate.slice(0, 10),
  days: s.days === 2 ? "2" : "1",
  levels: s.levels.map((l) => ({ key: l.id, code: l.code, label: l.label ?? "", capacity: String(l.capacity), isEntry: l.isEntry })),
});

const newLevel = (code: string, isEntry = false): LevelDraft => ({ key: tempKey(), code, label: "", capacity: "", isEntry });

/**
 * Sessions d'une inscription (spec 079, lot 2) : une ou deux journées, niveaux avec leurs places.
 * La question « Session et niveau » est ajoutée d'office au formulaire dès la première session.
 */
export default function SessionsEditor({
  formId,
  sessions,
  holdingByLevel,
  responses,
  disabled,
}: {
  readonly formId: string;
  readonly sessions: EditorSession[];
  readonly holdingByLevel: Record<string, number>;
  readonly responses: number;
  readonly disabled: boolean;
}) {
  const { call, busy } = useApi();
  const [drafts, setDrafts] = useState<SessionDraft[]>(() => sessions.map(toDraft));
  const used = new Set(Object.keys(holdingByLevel));
  const setSession = (key: string, patch: Partial<SessionDraft>) => setDrafts(drafts.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const setLevel = (s: SessionDraft, key: string, patch: Partial<LevelDraft>) =>
    setSession(s.key, { levels: s.levels.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  const save = () =>
    call(
      `/api/forms/${formId}`,
      "PATCH",
      {
        sessions: drafts.map((s) => ({
          key: s.key,
          label: s.label,
          startDate: s.startDate,
          days: Number(s.days),
          levels: s.levels.map((l) => ({ key: l.key, code: l.code, label: l.label.trim() || null, capacity: Number(l.capacity), isEntry: l.isEntry })),
        })),
      },
      "Sessions enregistrées"
    );

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="font-semibold text-ink">Sessions et niveaux</h2>
        <p className="text-[14px] text-ink-muted">
          Chaque personne choisit une session et un niveau ; les places d&apos;un niveau ne sont jamais dépassées. La question
          « Session et niveau » est ajoutée d&apos;office au formulaire.
        </p>
      </div>
      {drafts.map((s, si) => (
        <div key={s.key} className="space-y-3 rounded-control border border-line p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_170px_140px_44px] sm:items-end">
            <Input label={`Session ${si + 1}`} value={s.label} maxLength={150} placeholder="Ex. PCNC novembre" onChange={(e) => setSession(s.key, { label: e.target.value })} />
            <Input label="Premier jour" type="date" value={s.startDate} onChange={(e) => setSession(s.key, { startDate: e.target.value })} />
            <Select
              label="Durée"
              value={s.days}
              options={[
                { value: "1", label: "1 jour" },
                { value: "2", label: "2 jours" },
              ]}
              onChange={(e) => setSession(s.key, { days: e.target.value as "1" | "2" })}
            />
            <IconButton
              icon={Trash2}
              aria-label={`Supprimer la session ${si + 1}`}
              disabled={s.levels.some((l) => used.has(l.key))}
              onClick={() => setDrafts(drafts.filter((x) => x.key !== s.key))}
            />
          </div>
          <p className="text-[13px] font-semibold text-ink-muted">Niveaux</p>
          {s.levels.map((l, li) => (
            <div key={l.key} className="grid grid-cols-[90px_1fr_100px_44px] items-end gap-2">
              <Input label="" aria-label={`Code du niveau ${li + 1}`} placeholder="001" value={l.code} maxLength={20} onChange={(e) => setLevel(s, l.key, { code: e.target.value })} />
              <Input label="" aria-label={`Intitulé du niveau ${li + 1}`} placeholder="Intitulé (facultatif)" value={l.label} maxLength={150} onChange={(e) => setLevel(s, l.key, { label: e.target.value })} />
              <Input
                label=""
                aria-label={`Places du niveau ${li + 1}`}
                type="number"
                min={1}
                placeholder="Places"
                hint={holdingByLevel[l.key] ? `${holdingByLevel[l.key]} pris` : undefined}
                value={l.capacity}
                onChange={(e) => setLevel(s, l.key, { capacity: e.target.value })}
              />
              <IconButton
                icon={Trash2}
                aria-label={`Supprimer le niveau ${li + 1}`}
                disabled={s.levels.length <= 1 || used.has(l.key)}
                onClick={() => setSession(s.key, { levels: s.levels.filter((x) => x.key !== l.key) })}
              />
              <label className="col-span-4 -mt-1 flex min-h-9 items-center gap-2">
                <Checkbox checked={l.isEntry} onChange={(e) => setLevel(s, l.key, { isEntry: e.target.checked })} />
                <span className="text-[13px] text-ink">Niveau d&apos;entrée (« niveau précédent suivi » n&apos;est pas demandé)</span>
              </label>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSession(s.key, { levels: [...s.levels, newLevel(String(s.levels.length + 1).padStart(3, "0"))] })}
          >
            <Plus className="size-4" aria-hidden="true" /> Ajouter un niveau
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDrafts([...drafts, { key: tempKey(), label: "", startDate: "", days: "1", levels: [newLevel("001", true)] }])}
        >
          <Plus className="size-4" aria-hidden="true" /> Ajouter une session
        </Button>
        <Button type="button" disabled={busy || disabled} onClick={() => void save()}>
          {busy ? "Enregistrement…" : "Enregistrer les sessions"}
        </Button>
      </div>
      {responses > 0 && <p className="text-[13px] text-ink-muted">Un niveau qui a des inscrits ne peut être ni supprimé, ni ramené sous ses inscrits.</p>}
    </section>
  );
}
