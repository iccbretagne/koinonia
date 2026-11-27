"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

/** Boutons d'envoi et d'annulation (retour à la page précédente) des formulaires emploi. */
export default function JobFormActions({ saving, label }: { readonly saving: boolean; readonly label: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={() => router.back()}>
        Annuler
      </Button>
      <Button type="submit" disabled={saving}>
        {label}
      </Button>
    </div>
  );
}
