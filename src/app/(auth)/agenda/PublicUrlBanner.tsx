"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui";

export default function PublicUrlBanner({ slug }: { readonly slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/agenda-public/${slug}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <Link2 aria-hidden="true" className="size-4 shrink-0 text-brand-text" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="mb-0.5 text-xs font-semibold text-ink">Lien public — formulaire de demande de RDV</p>
        <p className="truncate text-xs text-ink-muted">{url}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={copy} className="min-h-11 shrink-0 sm:min-h-9">
        {copied ? (
          <>
            <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Lien copié
          </>
        ) : (
          <>
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Copier le lien
          </>
        )}
      </Button>
      <span className="sr-only" role="status">{copied ? "Lien copié" : ""}</span>
    </div>
  );
}
