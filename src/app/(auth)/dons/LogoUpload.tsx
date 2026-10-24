"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button, ConfirmModal, useToast } from "@/components/ui";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Adresse du logo pour le paramétrage (servi même si la page n'est pas publiée). */
export function settingsLogoSrc(churchId: string, logoVersion: string | null): string | null {
  return logoVersion ? `/api/giving/logo?churchId=${encodeURIComponent(churchId)}&v=${logoVersion}` : null;
}

/**
 * Dépôt et retrait du logo de l'église (spec 066), commun à la page et à la slide. Enregistré dès
 * le dépôt, indépendamment du bouton « Enregistrer » : le brouillon en attente n'est ni enregistré
 * ni effacé (spec 067).
 */
export default function LogoUpload({
  churchId,
  logoVersion,
  onLogoChange,
}: {
  readonly churchId: string;
  readonly logoVersion: string | null;
  readonly onLogoChange: (version: string | null) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const logoSrc = settingsLogoSrc(churchId, logoVersion);

  async function upload(file: File) {
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Le logo dépasse 2 Mo.");
      return;
    }
    const form = new FormData();
    form.append("churchId", churchId);
    form.append("file", file);
    setBusy(true);
    try {
      const res = await fetch("/api/giving/logo", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Dépôt impossible. Réessaie dans un instant.");
        return;
      }
      onLogoChange(body.logoVersion ?? null);
      toast.success(logoVersion ? "Logo remplacé et enregistré" : "Logo déposé et enregistré");
    } catch {
      toast.error("Dépôt impossible. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/giving/logo?churchId=${encodeURIComponent(churchId)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Retrait impossible. Réessaie dans un instant.");
        return;
      }
      onLogoChange(null);
      toast.success("Logo retiré");
    } catch {
      toast.error("Retrait impossible. Réessaie dans un instant.");
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div data-theme="dark" className="grid h-20 w-full place-items-center rounded-control bg-bg px-4 sm:w-56">
        {logoSrc ? (
          // Aperçu servi par Koinonia, proportions libres : pas de next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="Logo actuel" className="max-h-14 w-auto max-w-full object-contain" />
        ) : (
          <span className="text-sm text-ink-muted">Aucun logo</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Envoi…" : logoVersion ? "Remplacer" : "Déposer un logo"}
          </Button>
          {logoVersion && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}>
              Retirer
            </Button>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-ink">
          <Check aria-hidden="true" className="mt-px size-4 shrink-0 text-success" />
          Enregistré dès le dépôt, indépendamment du bouton « Enregistrer ».
        </p>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          PNG, JPEG ou WebP, 2 Mo au plus, en blanc ou clair. La comptabilité est prévenue.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <ConfirmModal
        open={confirmRemove}
        title="Retirer le logo ?"
        message="Il disparaît aussitôt de la page publique et de la slide. La comptabilité est prévenue."
        confirmLabel="Retirer le logo"
        confirming={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
