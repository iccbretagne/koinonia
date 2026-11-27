"use client";

import { Button } from "@/components/ui";
import { useApi } from "../../use-api";

/** Imprime la planche puis enregistre les étiquettes comme imprimées (version courante). */
export default function MarkPrinted({ eventId, itemIds }: { readonly eventId: string; readonly itemIds: string[] }) {
  const { call, busy } = useApi();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={itemIds.length === 0} onClick={() => window.print()}>
        Imprimer les étiquettes
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || itemIds.length === 0}
        onClick={() => call(`/api/ticketing/events/${eventId}/labels`, "POST", { itemIds }, itemIds.length > 1 ? `${itemIds.length} étiquettes marquées imprimées` : "1 étiquette marquée imprimée")}
      >
        {busy ? "Enregistrement en cours…" : "Marquer comme imprimées"}
      </Button>
    </div>
  );
}
