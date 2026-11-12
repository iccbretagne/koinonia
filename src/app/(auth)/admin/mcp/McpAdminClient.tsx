"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, StatusChip, useToast } from "@/components/ui";

interface Usage {
  churchId: string;
  churchName: string;
  connections: number;
  calls30d: number;
}

export default function McpAdminClient({ enabled, usage }: { readonly enabled: boolean; readonly usage: Usage[] }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch("/api/mcp/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(enabled ? "Fonction coupée pour l'instance" : "Fonction activée pour l'instance");
      router.refresh();
    } catch {
      toast.error("Le réglage n'a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold text-ink">Instance</h2>
          <StatusChip tone={enabled ? "success" : "neutral"}>{enabled ? "Activée" : "Coupée"}</StatusChip>
        </div>
        <p className="text-[15px] text-ink-muted">
          Coupée, aucune église ne peut proposer la connexion et toutes les connexions existantes cessent aussitôt de fonctionner.
        </p>
        <div>
          <Button variant="secondary" onClick={() => void toggle()} disabled={saving}>
            {saving ? "Enregistrement…" : enabled ? "Couper pour l'instance" : "Activer pour l'instance"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold text-ink">Activité par église</h2>
        {usage.length === 0 ? (
          <EmptyState title="Aucune activité" description="Les connexions et appels apparaîtront ici." size="sm" />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th className="px-4 py-2 font-medium">Église</th>
                  <th className="px-4 py-2 font-medium text-right">Connexions actives</th>
                  <th className="px-4 py-2 font-medium text-right">Appels (30 j)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usage.map((u) => (
                  <tr key={u.churchId}>
                    <td className="px-4 py-2 text-ink">{u.churchName}</td>
                    <td className="px-4 py-2 text-right text-ink">{u.connections}</td>
                    <td className="px-4 py-2 text-right text-ink">{u.calls30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
