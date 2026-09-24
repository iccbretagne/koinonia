"use client";

import { useEffect, useState } from "react";

interface HistoryEntry {
  id: string;
  action: string;
  from: string | null;
  to: string | null;
  note: string | null;
  at: string;
  author: string | null;
}

interface Props {
  readonly requestId: string;
  readonly statusLabels: Record<string, string>;
  /** Incrémenté par la fiche après chaque action, pour recharger la frise. */
  readonly refreshKey: number;
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
 * Frise des changements d'état d'une demande (spec 051) : état de départ, état d'arrivée,
 * date et auteur, y compris les relances consignées. Toutes les occurrences sont conservées.
 */
export default function RequestHistoryTimeline({ requestId, statusLabels, refreshKey }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/integration/requests/${requestId}/history`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((json: { entries: HistoryEntry[] }) => {
        if (!cancelled) { setEntries(json.entries); setError(false); }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [requestId, refreshKey]);

  const label = (s: string | null) => (s ? statusLabels[s] ?? s : "—");

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">Historique des statuts</h2>
      {error ? (
        <p className="text-sm text-gray-400">Historique indisponible.</p>
      ) : entries === null ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Aucun changement d&apos;état enregistré.</p>
      ) : (
        <ol className="relative border-l-2 border-gray-100 ml-1.5 space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="pl-4 relative">
              <span
                className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                  e.action === "relance" ? "bg-orange-400" : "bg-icc-violet"
                }`}
              />
              <p className="text-sm text-gray-800">
                {e.action === "relance" ? (
                  <>Relance consignée <span className="text-gray-400">({label(e.to)})</span></>
                ) : e.action === "handback" ? (
                  <>
                    Renvoyée à l&apos;intégration{" "}
                    <span className="text-gray-400">({label(e.from)} → {label(e.to)})</span>
                  </>
                ) : (
                  <>
                    {e.from && <span className="text-gray-500">{label(e.from)} → </span>}
                    <strong className="font-medium">{label(e.to)}</strong>
                  </>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {fmtDateTime(e.at)}
                {e.author ? ` · ${e.author}` : ""}
              </p>
              {e.note && <p className="text-xs text-gray-600 mt-0.5 italic">« {e.note} »</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
