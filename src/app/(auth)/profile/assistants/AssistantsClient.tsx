"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button, ConfirmModal, EmptyState, useToast } from "@/components/ui";

interface Connection {
  id: string;
  client: string;
  churchName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

const GUIDES = [
  { name: "Claude", steps: "Paramètres › Connecteurs › Ajouter un connecteur personnalisé, collez l'adresse, puis « Se connecter »." },
  { name: "ChatGPT", steps: "Paramètres › Connecteurs (mode développeur) › Créer, collez l'adresse, authentification OAuth." },
  { name: "Claude Code", steps: "Dans un terminal : claude mcp add --transport http koinonia <adresse>, puis /mcp pour vous connecter." },
];

export default function AssistantsClient({ serverUrl, initial }: { readonly serverUrl: string; readonly initial: Connection[] }) {
  const toast = useToast();
  const [connections, setConnections] = useState(initial);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(serverUrl);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Copie impossible : sélectionnez l'adresse à la main.");
    }
  }

  async function revoke() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/connections/${removing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setConnections((list) => list.filter((c) => c.id !== removing.id));
      toast.success("Accès retiré");
    } catch {
      toast.error("Le retrait n'a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-5 shadow-card flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold text-ink">Adresse du serveur</h2>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink">{serverUrl}</code>
          <Button variant="secondary" onClick={() => void copy()}>
            <Copy className="w-4 h-4" aria-hidden="true" /> Copier
          </Button>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-ink-muted">
          {GUIDES.map((g) => (
            <li key={g.name}>
              <strong className="text-ink">{g.name}</strong> — {g.steps}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted">
          Votre assistant vous renvoie vers Koinonia : choisissez l&apos;église et autorisez. Il ne lit jamais le suivi pastoral, les
          coordonnées bancaires ni les coordonnées d&apos;autres personnes.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold text-ink">Connexions</h2>
        {connections.length === 0 ? (
          <EmptyState title="Aucun assistant connecté" description="Les assistants que vous autorisez apparaissent ici." size="sm" />
        ) : (
          <ul className="rounded-card border border-line bg-surface divide-y divide-line">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{c.client}</p>
                  <p className="text-xs text-ink-subtle">
                    {c.churchName} · depuis le {dayFmt.format(new Date(c.createdAt))}
                    {c.lastUsedAt === null ? " · jamais utilisé" : ` · utilisé le ${dayFmt.format(new Date(c.lastUsedAt))}`}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setRemoving(c)}>
                  Révoquer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={removing !== null}
        title="Révoquer l'accès"
        message={`${removing?.client ?? "Cet assistant"} ne pourra plus lire vos informations, immédiatement. Pour le reconnecter, il faudra autoriser de nouveau.`}
        confirmLabel="Révoquer"
        confirmingLabel="Révocation…"
        variant="danger"
        confirming={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
