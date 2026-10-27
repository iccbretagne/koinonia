"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import {
  CHURCH_LOGO_LABEL,
  CHURCH_LOGO_MAX_BYTES,
  churchLogoSrc,
  type ChurchLogoVariant,
} from "@/modules/core/schemas";

const HINT: Record<ChurchLogoVariant, string> = {
  light: "Logo principal, affiché à la place des plumes ICC.",
  dark: "Facultatif, pour le thème sombre (souvent une version blanche). À défaut, le logo pour fond clair s'affiche.",
};

function Preview({ theme, src, alt }: { readonly theme: "light" | "dark"; readonly src: string | null; readonly alt: string }) {
  return (
    <div
      data-theme={theme}
      className="grid h-16 place-items-center rounded-control border border-line bg-surface px-3"
    >
      {src ? (
        // Aperçu servi par Koinonia, proportions libres : pas de next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-9 w-auto max-w-full object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- SVG statique
        <img src="/brand/icc-plumes.svg" alt={alt} width={36} height={36} className="h-9 w-auto" />
      )}
    </div>
  );
}

/**
 * Un emplacement du logo de l'église (spec 072) : aperçu sur fond clair et sombre, dépôt
 * enregistré aussitôt (indépendamment du bouton « Enregistrer »), retrait après confirmation.
 */
export default function ChurchLogoSlot({
  churchId,
  variant,
  version,
  fallbackSrc,
  onChange,
}: {
  readonly churchId: string;
  readonly variant: ChurchLogoVariant;
  readonly version: string | null;
  /** Logo affiché sans celui-ci (le fond clair, pour l'emplacement sombre). */
  readonly fallbackSrc: string | null;
  readonly onChange: (version: string | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = CHURCH_LOGO_LABEL[variant];
  const src = version ? churchLogoSrc(churchId, variant, version) : fallbackSrc;
  const endpoint = `/api/churches/${encodeURIComponent(churchId)}/logo`;

  async function upload(file: File) {
    if (file.size > CHURCH_LOGO_MAX_BYTES) {
      toast.error("Le logo dépasse 2 Mo.");
      return;
    }
    const form = new FormData();
    form.append("variant", variant);
    form.append("file", file);
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Dépôt impossible. Réessaie dans un instant.");
        return;
      }
      onChange(body.version ?? null);
      toast.success(version ? "Logo remplacé et enregistré" : "Logo déposé et enregistré");
      router.refresh();
    } catch {
      toast.error("Dépôt impossible. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`${endpoint}?variant=${variant}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Retrait impossible. Réessaie dans un instant.");
        return;
      }
      onChange(null);
      toast.success("Logo retiré");
      router.refresh();
    } catch {
      toast.error("Retrait impossible. Réessaie dans un instant.");
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-ink">Logo pour {label}</p>
        <p className="text-[13px] leading-[18px] text-ink-muted">{HINT[variant]}</p>
      </div>
      <Preview
        theme={variant}
        src={src}
        alt={src ? `Aperçu sur ${label}` : `Aperçu sur ${label} : plumes ICC, aucun logo`}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Envoi…" : version ? "Remplacer" : "Déposer un logo"}
        </Button>
        {version && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>
            Retirer
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={`Fichier du logo pour ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <ConfirmModal
        open={confirmRemove}
        title={`Retirer le logo pour ${label} ?`}
        message={
          variant === "light"
            ? "Les plumes ICC reprennent sa place dans l'interface, pour tout le monde."
            : "Le logo pour fond clair s'affichera aussi en thème sombre."
        }
        confirmLabel="Retirer le logo"
        confirming={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
