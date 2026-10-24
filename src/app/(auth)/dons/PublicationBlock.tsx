"use client";

import Link from "next/link";
import { Clock, ExternalLink, Presentation } from "lucide-react";
import { StatusChip } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import Switch from "./Switch";
import { publicationStatus } from "./settings-state";

/**
 * Publication de la page de dons, en tête de l'écran (spec 067). La pastille dit ce que voient
 * les gens (version enregistrée) ; l'interrupteur suit le bouton « Enregistrer ».
 */
export default function PublicationBlock({
  savedEnabled,
  draftEnabled,
  onToggle,
  publicUrl,
}: {
  readonly savedEnabled: boolean;
  readonly draftEnabled: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly publicUrl: string;
}) {
  const status = publicationStatus(savedEnabled, draftEnabled);
  return (
    <section aria-labelledby="giving-publication" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="giving-publication" className="font-display text-[17px] font-semibold leading-6 text-ink">
              Publication
            </h2>
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </div>
          <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
            {savedEnabled
              ? "Chacun peut ouvrir la page publique et la slide peut être projetée."
              : "La page publique affiche « Cette page n'est pas disponible »."}
          </p>
          {status.pending && (
            <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-warning">
              <Clock aria-hidden="true" className="size-4 shrink-0" />
              {status.pending}
            </p>
          )}
        </div>
        <Switch checked={draftEnabled} onChange={onToggle} label="Publier la page" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
          <ExternalLink aria-hidden="true" className="size-4" />
          Voir la page publique
        </a>
        {savedEnabled ? (
          <Link href="/dons/slide" className={buttonClasses("secondary")}>
            <Presentation aria-hidden="true" className="size-4" />
            Slide de projection
          </Link>
        ) : (
          <>
            <span aria-disabled="true" aria-describedby="slide-unavailable" className={buttonClasses("secondary")}>
              <Presentation aria-hidden="true" className="size-4" />
              Slide de projection
            </span>
            <p id="slide-unavailable" className="w-full text-[13px] leading-[18px] text-ink-muted">
              Publie et enregistre la page pour projeter la slide.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
