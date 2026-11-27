"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  readonly onClick: () => void;
  readonly zipping: boolean;
}

/** Bouton « Tout télécharger (.zip) » des liens de partage publics, avec état de préparation. */
export default function DownloadAllButton({ onClick, zipping }: Props) {
  return (
    <Button type="button" onClick={onClick} disabled={zipping}>
      {zipping ? (
        <>
          <span aria-hidden="true" className="size-4 rounded-full border-2 border-on-brand/30 border-t-on-brand animate-spin" />
          Préparation en cours…
        </>
      ) : (
        <>
          <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Tout télécharger (.zip)
        </>
      )}
    </Button>
  );
}
