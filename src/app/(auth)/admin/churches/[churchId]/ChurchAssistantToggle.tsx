"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusChip, useToast } from "@/components/ui";

/**
 * Assistant de prise en main pour l'église (spec 075) : l'Admin peut le couper ; ses membres
 * voient alors le lien vers le guide à la place. Affiché seulement si l'instance l'a activé.
 */
export default function ChurchAssistantToggle({ churchId, disabled }: { readonly churchId: string; readonly disabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/assistant/church/${churchId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: !disabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(disabled ? "Assistant rétabli pour l'église" : "Assistant coupé pour l'église");
      router.refresh();
    } catch {
      toast.error("Le réglage n'a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold text-ink">Assistant</h2>
        <StatusChip tone={disabled ? "neutral" : "success"}>{disabled ? "Coupé" : "Proposé"}</StatusChip>
      </div>
      <p className="text-[15px] text-ink-muted">
        L&apos;assistant répond aux questions sur l&apos;utilisation de Koinonia, selon le rôle de chacun, sans service externe.
        Coupé, vos membres voient le lien vers le guide d&apos;utilisation à la place.
      </p>
      <div>
        <Button variant="secondary" onClick={() => void toggle()} disabled={saving}>
          {saving ? "Enregistrement…" : disabled ? "Rétablir l'assistant" : "Couper l'assistant pour l'église"}
        </Button>
      </div>
    </section>
  );
}
