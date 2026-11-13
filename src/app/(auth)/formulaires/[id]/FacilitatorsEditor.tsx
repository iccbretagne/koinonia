"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, IconButton, Select } from "@/components/ui";
import { useApi } from "../use-api";
import type { EditorSession } from "./SessionsEditor";

export interface Facilitator {
  userId: string;
  name: string;
  allScope: boolean;
  scopes: { sessionId: string; levelId: string | null }[];
}

/** Clé d'un périmètre : « session » ou « session:niveau ». */
const scopeKey = (s: { sessionId: string; levelId: string | null }) => (s.levelId ? `${s.sessionId}:${s.levelId}` : s.sessionId);

/**
 * Intervenants (spec 079, lot 2) : comptes de l'église qui voient les inscrits de leur périmètre
 * et font l'appel, sans export ni modification ; accès éteint à la clôture.
 */
export default function FacilitatorsEditor({
  formId,
  sessions,
  members,
  initial,
}: {
  readonly formId: string;
  readonly sessions: EditorSession[];
  readonly members: { id: string; name: string }[];
  readonly initial: Facilitator[];
}) {
  const { call, busy } = useApi();
  const [list, setList] = useState<Facilitator[]>(initial);
  const [adding, setAdding] = useState("");
  const taken = new Set(list.map((f) => f.userId));
  const options = sessions.flatMap((s) => [
    { key: s.id, sessionId: s.id, levelId: null as string | null, label: `${s.label} (toute la session)` },
    ...s.levels.map((l) => ({ key: `${s.id}:${l.id}`, sessionId: s.id, levelId: l.id as string | null, label: `${s.label} — niveau ${l.code}` })),
  ]);
  const patch = (userId: string, next: Partial<Facilitator>) => setList(list.map((f) => (f.userId === userId ? { ...f, ...next } : f)));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-ink">Intervenants</h2>
        <p className="text-[14px] text-ink-muted">
          Ils voient les inscrits de leur périmètre et notent les présences, sans exporter ni modifier. Leur accès s&apos;éteint à la clôture.
        </p>
      </div>
      {list.length === 0 && <p className="text-[14px] text-ink-muted">Aucun intervenant.</p>}
      <ul className="space-y-3">
        {list.map((f) => {
          const selected = new Set(f.scopes.map(scopeKey));
          return (
            <li key={f.userId} className="space-y-2 rounded-control border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{f.name}</p>
                <IconButton icon={Trash2} aria-label={`Retirer ${f.name}`} onClick={() => setList(list.filter((x) => x.userId !== f.userId))} />
              </div>
              <label className="flex min-h-9 items-center gap-2">
                <Checkbox checked={f.allScope} onChange={(e) => patch(f.userId, { allScope: e.target.checked })} />
                <span className="text-[14px] text-ink">Tout le formulaire</span>
              </label>
              {!f.allScope && (
                <div className="grid gap-1 sm:grid-cols-2">
                  {options.map((o) => (
                    <label key={o.key} className="flex min-h-9 items-center gap-2">
                      <Checkbox
                        checked={selected.has(o.key)}
                        onChange={(e) =>
                          patch(f.userId, {
                            scopes: e.target.checked
                              ? [...f.scopes, { sessionId: o.sessionId, levelId: o.levelId }]
                              : f.scopes.filter((x) => scopeKey(x) !== o.key),
                          })
                        }
                      />
                      <span className="text-[14px] text-ink">{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Select
            label="Ajouter un intervenant"
            placeholder="Choisir un compte…"
            value={adding}
            options={members.filter((m) => !taken.has(m.id)).map((m) => ({ value: m.id, label: m.name }))}
            onChange={(e) => setAdding(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!adding}
          onClick={() => {
            const m = members.find((x) => x.id === adding);
            if (m) setList([...list, { userId: m.id, name: m.name, allScope: true, scopes: [] }]);
            setAdding("");
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> Ajouter
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void call(
              `/api/forms/${formId}/facilitators`,
              "PUT",
              { facilitators: list.map((f) => ({ userId: f.userId, allScope: f.allScope, scopes: f.allScope ? [] : f.scopes })) },
              "Intervenants enregistrés"
            )
          }
        >
          {busy ? "Enregistrement…" : "Enregistrer les intervenants"}
        </Button>
      </div>
    </section>
  );
}
