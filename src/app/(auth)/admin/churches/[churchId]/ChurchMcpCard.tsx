"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, StatusChip, useToast } from "@/components/ui";

interface Connection {
  id: string;
  client: string;
  user: { name: string | null; email: string | null };
  createdAt: string;
  lastUsedAt: string | null;
  actions: boolean;
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/**
 * Assistants IA (MCP, spec 081) pour l'église : interrupteur (coupé par défaut) et comptes
 * connectés, révocables par l'Admin — jamais le contenu des échanges.
 */
export default function ChurchMcpCard({
  churchId,
  enabled,
  connections,
}: {
  readonly churchId: string;
  readonly enabled: boolean;
  readonly connections: Connection[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/mcp/church/${churchId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(enabled ? "Connexion des assistants IA coupée" : "Connexion des assistants IA activée");
      router.refresh();
    } catch {
      toast.error("Le réglage n'a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!removing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mcp/connections/${removing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Connexion révoquée");
      router.refresh();
    } catch {
      toast.error("La révocation n'a pas abouti. Réessayez.");
    } finally {
      setSaving(false);
      setRemoving(null);
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold text-ink">Assistants IA (MCP)</h2>
        <StatusChip tone={enabled ? "success" : "neutral"}>{enabled ? "Activé" : "Coupé"}</StatusChip>
      </div>
      <p className="text-[15px] text-ink-muted">
        Permet à chaque membre de connecter son propre assistant IA (Claude, ChatGPT…) pour lire ce qu&apos;il voit déjà dans
        Koinonia ; s&apos;il l&apos;autorise, l&apos;assistant peut aussi déclarer ses absences et répondre aux demandes de
        disponibilité, toujours après sa confirmation. Jamais de suivi pastoral, de coordonnées bancaires ni de coordonnées d&apos;autrui. Couper
        rend aussitôt toutes les connexions de l&apos;église inutilisables.
      </p>
      <div>
        <Button variant="secondary" onClick={() => void toggle()} disabled={saving}>
          {saving ? "Enregistrement…" : enabled ? "Couper pour l'église" : "Activer pour l'église"}
        </Button>
      </div>
      {connections.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{c.user.name ?? c.user.email}</p>
                <p className="text-xs text-ink-subtle">
                  {c.client} · {c.actions ? "lecture et actions" : "lecture seule"} · depuis le{" "}
                  {dayFmt.format(new Date(c.createdAt))}
                  {c.lastUsedAt === null ? "" : ` · utilisé le ${dayFmt.format(new Date(c.lastUsedAt))}`}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setRemoving(c)} disabled={saving}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmModal
        open={removing !== null}
        title="Révoquer la connexion"
        message={`L'assistant de ${removing?.user.name ?? removing?.user.email ?? "ce compte"} ne pourra plus lire Koinonia.`}
        confirmLabel="Révoquer"
        confirmingLabel="Révocation…"
        variant="danger"
        confirming={saving}
        onConfirm={() => void revoke()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
