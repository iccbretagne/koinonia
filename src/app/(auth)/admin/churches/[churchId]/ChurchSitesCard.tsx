"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusChip, useToast } from "@/components/ui";

/** Sites d'événement de billetterie (spec 084) pour l'église : interrupteur, coupé par défaut. */
export default function ChurchSitesCard({ churchId, enabled }: { readonly churchId: string; readonly enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ticketing/church/${churchId}/sites`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(enabled ? "Sites d'événement coupés" : "Sites d'événement activés");
      router.refresh();
    } catch {
      toast.error("Le réglage n'a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-6 text-ink">Sites d&apos;événement</h2>
        <StatusChip tone={enabled ? "success" : "neutral"}>{enabled ? "Activé" : "Coupé"}</StatusChip>
      </div>
      <p className="text-[15px] text-ink-muted">
        Permet aux organisateurs d&apos;un événement de billetterie de lui donner son propre site, à ses couleurs, avec ses
        pages (dress code, menus, infos pratiques). Couper retire aussitôt tous les sites de l&apos;église ; la page
        d&apos;inscription reste disponible.
      </p>
      <div>
        <Button variant="secondary" onClick={() => void toggle()} disabled={saving}>
          {saving ? "Enregistrement…" : enabled ? "Couper pour l'église" : "Activer pour l'église"}
        </Button>
      </div>
    </section>
  );
}
