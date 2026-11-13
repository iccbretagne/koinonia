"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Select } from "@/components/ui";
import { sessionDates } from "@/components/forms/FormFiller";
import type { EditorSession } from "./SessionsEditor";

interface Sheet {
  session: { id: string; label: string; startDate: string; days: number };
  rows: { responseId: string; name: string; level: string; cells: Record<string, boolean> }[];
}

const HALVES = [
  { half: "AM", label: "Matin" },
  { half: "PM", label: "Après-midi" },
] as const;
const REFRESH_MS = 15_000;

/**
 * Feuille de présence (spec 079, lot 2) : une case par jour et demi-journée. Chaque coche
 * s'enregistre seule ; la feuille se relit toutes les 15 s pour montrer les coches des autres
 * intervenants (la dernière saisie l'emporte).
 */
export default function Attendance({ formId, sessions }: { readonly formId: string; readonly sessions: EditorSession[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/forms/${formId}/attendance?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "La feuille n'a pas pu être chargée.");
    setError(null);
    setSheet(body as Sheet);
  }, [formId, sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement au montage puis relecture périodique
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function toggle(responseId: string, day: number, half: "AM" | "PM", present: boolean) {
    const key = `${responseId}-${day}-${half}`;
    setSaving(key);
    setSheet((s) => s && { ...s, rows: s.rows.map((r) => (r.responseId === responseId ? { ...r, cells: { ...r.cells, [`${day}-${half}`]: present } } : r)) });
    const res = await fetch(`/api/forms/${formId}/attendance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, cells: [{ responseId, day, half, present }] }),
    });
    setSaving(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "La présence n'a pas été enregistrée.");
      void load();
    }
  }

  if (sessions.length === 0) return <p className="text-ink-muted">Aucune session.</p>;
  const days = sheet ? Array.from({ length: sheet.session.days }, (_, i) => i + 1) : [];

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Select label="Session" value={sessionId} options={sessions.map((s) => ({ value: s.id, label: s.label }))} onChange={(e) => setSessionId(e.target.value)} />
      </div>
      {sheet && <p className="text-[14px] text-ink-muted first-letter:uppercase">{sessionDates(sheet.session)}</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      {sheet && sheet.rows.length === 0 && <p className="text-ink-muted">Aucun inscrit confirmé dans votre périmètre.</p>}
      {sheet && sheet.rows.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-surface-sunken text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Inscrit</th>
                <th className="px-3 py-2 font-semibold">Niveau</th>
                {days.flatMap((d) =>
                  HALVES.map((h) => (
                    <th key={`${d}-${h.half}`} className="px-3 py-2 text-center font-semibold whitespace-nowrap">
                      {days.length > 1 ? `J${d} ` : ""}
                      {h.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.responseId} className="border-t border-line">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.level}</td>
                  {days.flatMap((d) =>
                    HALVES.map((h) => {
                      const key = `${d}-${h.half}`;
                      return (
                        <td key={key} className="px-3 py-1 text-center">
                          <input
                            type="checkbox"
                            className="size-6 accent-brand"
                            aria-label={`${r.name} — ${days.length > 1 ? `jour ${d}, ` : ""}${h.label.toLowerCase()}`}
                            checked={r.cells[key] === true}
                            disabled={saving === `${r.responseId}-${key}`}
                            onChange={(e) => void toggle(r.responseId, d, h.half, e.target.checked)}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
