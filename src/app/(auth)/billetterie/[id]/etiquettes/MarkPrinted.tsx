"use client";

import { Button } from "@/components/ui";
import { useApi } from "../../use-api";

/** Imprime la planche puis enregistre les étiquettes comme imprimées (version courante). */
export default function MarkPrinted({ eventId, itemIds }: { readonly eventId: string; readonly itemIds: string[] }) {
  const { call, busy } = useApi();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => window.print()}>
        Imprimer
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || itemIds.length === 0}
        onClick={() => call(`/api/ticketing/events/${eventId}/labels`, "POST", { itemIds }, `${itemIds.length} étiquette(s) marquée(s) imprimée(s)`)}
      >
        Marquer imprimées
      </Button>
    </div>
  );
}
