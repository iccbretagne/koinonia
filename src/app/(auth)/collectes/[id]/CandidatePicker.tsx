"use client";

import { useEffect, useState } from "react";
import { Button, SearchInput } from "@/components/ui";

export interface Candidate {
  id: string;
  name: string;
  email: string;
}

/**
 * Recherche d'un compte de l'église de la campagne (`/api/campaigns/[id]/candidates`, 20 au plus)
 * pour l'ajouter comme gestionnaire ou répondant. `exclude` masque ceux déjà présents.
 */
export default function CandidatePicker({
  campaignId,
  exclude,
  actionLabel,
  disabled,
  onPick,
}: {
  readonly campaignId: string;
  readonly exclude: (candidate: Candidate) => boolean;
  readonly actionLabel: string;
  readonly disabled?: boolean;
  readonly onPick: (candidate: Candidate) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/candidates?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setResults((await res.json()) as Candidate[]);
        setFailed(false);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [campaignId, q]);

  const shown = (results ?? []).filter((c) => !exclude(c));

  return (
    <div className="flex flex-col gap-3">
      <SearchInput aria-label="Rechercher un compte" placeholder="Nom ou email" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {failed && <p className="text-[13px] text-danger">Recherche impossible. Réessayez dans un instant.</p>}
      {results && shown.length === 0 && !failed && <p className="text-[15px] text-ink-muted">Aucun compte trouvé.</p>}
      {shown.length > 0 && (
        <ul className="overflow-hidden rounded-card border border-line">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-t border-line px-3 py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{c.name}</p>
                <p className="truncate text-[13px] text-ink-muted">{c.email}</p>
              </div>
              <Button type="button" size="sm" className="min-h-11 sm:min-h-9" variant="secondary" disabled={disabled} onClick={() => onPick(c)}>
                {actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
