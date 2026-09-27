"use client";

import { useState, useEffect } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Bandeau de lien public à copier — partagé entre plusieurs formulaires publics sans session
 * (ex. `/rejoindre/[slug]` sur `/integration/requests`, `/agenda-public/[slug]` sur `/care`) :
 * même composant, `path` et `label` propres à chaque appelant.
 */
export default function PublicFormBanner({
  path,
  label,
}: {
  /** Chemin absolu du formulaire public, sans origine (ex. `/rejoindre/icc-rennes`). */
  readonly path: string;
  readonly label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  // `window` n'existe pas au rendu serveur : l'origine ne peut etre connue qu'apres montage,
  // sinon l'hydratation diverge.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  const url = `${origin}${path}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card bg-brand-soft px-4 py-3">
      <Link2 aria-hidden="true" className="size-5 shrink-0 text-brand-text" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[13px] font-semibold leading-[18px] text-brand-text">{label}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] leading-[18px] text-ink-muted hover:text-brand-text hover:underline"
        >
          {url}
        </a>
      </div>
      <Button variant="secondary" size="sm" onClick={copy} className="shrink-0" aria-live="polite">
        {copied ? (
          <>
            <Check aria-hidden="true" className="size-4" strokeWidth={2} />
            Lien copié
          </>
        ) : (
          <>
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Copier le lien
          </>
        )}
      </Button>
    </div>
  );
}
