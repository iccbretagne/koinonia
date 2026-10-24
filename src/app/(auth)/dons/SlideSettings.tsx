"use client";

import type { ReactNode } from "react";
import { Button, Input } from "@/components/ui";
import { slideVerse } from "./slide/slide-fit";
import Section from "./Section";
import SupportIdentity, { type IdentitySettings } from "./SupportIdentity";

/**
 * Onglet « Slide de projection » (spec 067) : tous les réglages propres à la slide. Le logo et le
 * verset, communs aux deux supports, se modifient dans l'onglet Page : on les montre ici avec un
 * renvoi direct.
 */
export default function SlideSettings({
  identity,
  onIdentityChange,
  logoSrc,
  verse,
  shortUrl,
  onEditLogo,
  onEditVerse,
}: {
  readonly identity: IdentitySettings;
  readonly onIdentityChange: (patch: Partial<IdentitySettings>) => void;
  readonly logoSrc: string | null;
  readonly verse: { readonly text: string; readonly reference: string | null } | null;
  /** Champ « Adresse courte », déjà relié au brouillon. */
  readonly shortUrl: { value: string; error?: string; onChange: (e: { target: { value: string } }) => void };
  readonly onEditLogo: () => void;
  readonly onEditVerse: () => void;
}): ReactNode {
  return (
    <>
      <Section title="Nom et logo sur la slide">
        <div className="flex items-center gap-3">
          <div data-theme="dark" className="grid h-14 w-32 shrink-0 place-items-center rounded-control bg-bg px-2">
            {logoSrc ? (
              // Miniature servie par Koinonia : pas de next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="Logo actuel" className="max-h-10 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-xs text-ink-muted">Aucun logo</span>
            )}
          </div>
          <Button type="button" variant="ghost" onClick={onEditLogo}>
            {logoSrc ? "Changer le logo" : "Déposer un logo"}
          </Button>
        </div>
        <SupportIdentity support="Slide" value={identity} hasLogo={Boolean(logoSrc)} onChange={onIdentityChange} />
      </Section>

      <Section title="Verset projeté" description="Le même que sur la page publique.">
        {verse ? (
          <blockquote className="rounded-control bg-surface-sunken px-3 py-2 text-sm italic leading-5 text-ink">
            « {slideVerse(verse.text)} »
            {verse.reference && <b className="not-italic text-brand-text"> — {verse.reference}</b>}
          </blockquote>
        ) : (
          <p className="text-sm text-ink-muted">Aucun verset : la slide n&apos;en affiche pas.</p>
        )}
        <div>
          <Button type="button" variant="ghost" onClick={onEditVerse}>
            {verse ? "Modifier le verset" : "Ajouter un verset"}
          </Button>
        </div>
      </Section>

      <Section title="QR code">
        <Input
          label="Adresse courte (facultative)"
          type="url"
          placeholder="https://"
          hint="Elle est écrite sous le QR code. Sans elle, la slide n'affiche que le QR code, qui mène à la page Koinonia."
          {...shortUrl}
        />
      </Section>
    </>
  );
}
