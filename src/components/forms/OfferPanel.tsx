"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";

const dateTimeFr = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Liste d'attente : une place est proposée, à accepter ou décliner avant son expiration (spec 079). */
export default function OfferPanel({
  url,
  expiresAt,
  onDone,
}: {
  readonly url: string;
  readonly expiresAt: string | null;
  readonly onDone: (status: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    if (!accept && !confirm("Décliner la place ? Elle sera proposée à la personne suivante.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "La demande n'a pas abouti.");
    onDone(body.status);
  }

  return (
    <Alert tone="warning" title="Une place s'est libérée pour vous">
      <p>{expiresAt ? `Confirmez avant ${dateTimeFr(expiresAt)}, sinon elle sera proposée à la personne suivante.` : "Confirmez-la pour la garder."}</p>
      {error && <p className="mt-2 font-semibold">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void answer(true)}>
          Accepter la place
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void answer(false)}>
          Décliner
        </Button>
      </div>
    </Alert>
  );
}
