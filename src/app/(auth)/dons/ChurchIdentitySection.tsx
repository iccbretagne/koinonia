"use client";

import { useRef, useState } from "react";
import type { GivingNameSize } from "@/generated/prisma/enums";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import Switch from "./Switch";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const SIZES: readonly { value: GivingNameSize; label: string }[] = [
  { value: "SMALL", label: "Petit" },
  { value: "MEDIUM", label: "Moyen" },
  { value: "LARGE", label: "Grand" },
];

/** Réglages d'un support (page ou slide), tels que tenus dans le brouillon du formulaire. */
export interface IdentitySettings {
  readonly logoShown: boolean;
  readonly nameShown: boolean;
  readonly nameSize: GivingNameSize;
}

/** Adresse du logo pour le paramétrage (servi même si la page est inactive). */
export function settingsLogoSrc(churchId: string, logoVersion: string | null): string | null {
  return logoVersion ? `/api/giving/logo?churchId=${encodeURIComponent(churchId)}&v=${logoVersion}` : null;
}

function Row({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SizeChoice({
  label,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: GivingNameSize;
  readonly disabled: boolean;
  readonly onChange: (next: GivingNameSize) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      className={`grid grid-cols-3 gap-1 rounded-control bg-surface-sunken p-1 ${disabled ? "opacity-50" : ""}`}
    >
      {SIZES.map((size) => {
        const active = value === size.value;
        return (
          <button
            key={size.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(size.value)}
            className={`min-h-[40px] rounded-[8px] font-display text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
              active ? "bg-surface text-brand-text shadow-card" : "text-ink-muted hover:text-ink"
            }`}
          >
            {size.label}
          </button>
        );
      })}
    </div>
  );
}

function SupportBlock({
  title,
  note,
  value,
  hasLogo,
  onChange,
}: {
  readonly title: string;
  readonly note?: string;
  readonly value: IdentitySettings;
  readonly hasLogo: boolean;
  readonly onChange: (patch: Partial<IdentitySettings>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-control border border-line p-4">
      <legend className="px-1 font-display text-sm font-semibold text-ink">{title}</legend>
      {note && <p className="-mt-1 text-[13px] leading-[18px] text-ink-muted">{note}</p>}
      <Row label="Afficher le logo" hint={hasLogo ? undefined : "Aucun logo déposé."}>
        <Switch
          checked={value.logoShown}
          disabled={!hasLogo}
          onChange={(v) => onChange({ logoShown: v })}
          label={`${title} : afficher le logo`}
        />
      </Row>
      <Row label="Afficher le nom de l'église">
        <Switch checked={value.nameShown} onChange={(v) => onChange({ nameShown: v })} label={`${title} : afficher le nom`} />
      </Row>
      <SizeChoice
        label={`${title} : taille du nom`}
        value={value.nameSize}
        disabled={!value.nameShown}
        onChange={(v) => onChange({ nameSize: v })}
      />
    </fieldset>
  );
}

/**
 * Section « Nom et logo de l'église » du paramétrage des dons (spec 066). Les réglages du nom et
 * de l'affichage du logo suivent le bouton « Enregistrer » ; le logo lui-même est enregistré dès
 * son dépôt ou son retrait.
 */
export default function ChurchIdentitySection({
  churchId,
  logoVersion,
  onLogoChange,
  page,
  slide,
  onPageChange,
  onSlideChange,
}: {
  readonly churchId: string;
  readonly logoVersion: string | null;
  readonly onLogoChange: (version: string | null) => void;
  readonly page: IdentitySettings;
  readonly slide: IdentitySettings;
  readonly onPageChange: (patch: Partial<IdentitySettings>) => void;
  readonly onSlideChange: (patch: Partial<IdentitySettings>) => void;
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
      toast.success(logoVersion ? "Logo remplacé" : "Logo déposé");
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
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Nom et logo de l&apos;église</h2>
      <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
        Réglés séparément pour la page publique et pour la slide.
      </p>

      <div className="mt-4 flex flex-col gap-4">
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
            <p className="text-[13px] leading-[18px] text-ink-muted">
              PNG, JPEG ou WebP, 2 Mo au plus, en blanc ou clair. Le logo est enregistré dès son dépôt et la
              comptabilité est prévenue.
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
        </div>

        <SupportBlock title="Page publique" value={page} hasLogo={Boolean(logoVersion)} onChange={onPageChange} />
        <SupportBlock
          title="Slide de projection"
          note="Visible dans la slide de projection, après enregistrement."
          value={slide}
          hasLogo={Boolean(logoVersion)}
          onChange={onSlideChange}
        />
      </div>

      <ConfirmModal
        open={confirmRemove}
        title="Retirer le logo ?"
        message="Il disparaît aussitôt de la page publique et de la slide. La comptabilité est prévenue."
        confirmLabel="Retirer le logo"
        confirming={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </section>
  );
}
