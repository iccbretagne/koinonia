"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

/** Boutons d'envoi et d'annulation (retour à la page précédente) des formulaires emploi. */
export default function JobFormActions({ saving, label }: { readonly saving: boolean; readonly label: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-3 pt-2">
      <Button type="submit" disabled={saving}>
        {label}
      </Button>
      <Button type="button" variant="secondary" onClick={() => router.back()}>
        Annuler
      </Button>
    </div>
  );
}
