"use client";

import { useEffect, useState } from "react";

export interface HistoryEntry {
  id: string;
  action: string | null;
  from: string | null;
  to: string | null;
  assignee?: string | null;
  note: string | null;
  at: string;
  author: string | null;
}

interface Props {
  /** Endpoint retournant soit un tableau d'entrées, soit `{ entries: [...] }`. */
  readonly fetchUrl: string;
  readonly statusLabels: Record<string, string>;
  /** Libellé d'action (spec 052 : validate/reject/reassign/…) — l'action brute sert de repli. */
  readonly actionLabels?: Record<string, string>;
  /** Incrémenté par la fiche après chaque action, pour recharger la frise. */
  readonly refreshKey?: number;
  readonly title?: string;
  /** Libellé de la personne en charge (« Référent » pour un RDV, « Conseiller » pour un suivi). */
  readonly assigneeLabel?: string;
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Frise générique des changements d'état d'une fiche (spec 051, déplacée dans `src/components/`
 * pour spec 052 T51 : partagée entre les demandes d'intégration et les items `care`
 * (rendez-vous pastoraux, suivis MSDP) — seuls l'URL et les libellés diffèrent par appelant.
 */
export default function HistoryTimeline({ fetchUrl, statusLabels, actionLabels, refreshKey = 0, title = "Historique", assigneeLabel = "Accompagnant" }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(fetchUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((json: HistoryEntry[] | { entries: HistoryEntry[] }) => {
        if (cancelled) return;
        setEntries(Array.isArray(json) ? json : json.entries);
        setError(false);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [fetchUrl, refreshKey]);

  const statusLabel = (s: string | null) => (s ? statusLabels[s] ?? s : "—");

  return (
    <div className="bg-surface rounded-card border border-line p-4 md:p-5 space-y-3">
      <h2 className="text-sm font-semibold text-ink-muted">{title}</h2>
      {error ? (
        <p className="text-sm text-ink-subtle">Historique indisponible.</p>
      ) : entries === null ? (
        <p className="text-sm text-ink-subtle">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-subtle italic">Aucun changement d&apos;état enregistré.</p>
      ) : (
        <ol className="relative border-l-2 border-line ml-1.5 space-y-3">
          {entries.map((e) => {
            const actionLabel = e.action ? actionLabels?.[e.action] ?? e.action : null;
            const showArrow = !!e.from && !!e.to && e.from !== e.to;
            return (
              <li key={e.id} className="pl-4 relative">
                <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-surface bg-brand" />
                <p className="text-sm text-ink">
                  {actionLabel ? (
                    <>
                      <strong className="font-medium">{actionLabel}</strong>
                      {showArrow && (
                        <span className="text-ink-subtle"> ({statusLabel(e.from)} → {statusLabel(e.to)})</span>
                      )}
                    </>
                  ) : (
                    <>
                      {e.from && <span className="text-ink-muted">{statusLabel(e.from)} → </span>}
                      <strong className="font-medium">{statusLabel(e.to)}</strong>
                    </>
                  )}
                </p>
                <p className="text-xs text-ink-subtle">
                  {fmtDateTime(e.at)}
                  {e.author ? ` · ${e.author}` : ""}
                </p>
                {e.assignee && <p className="text-xs text-ink-muted mt-0.5">{assigneeLabel} : {e.assignee}</p>}
                {e.note && <p className="text-xs text-ink-muted mt-0.5 italic">« {e.note} »</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
