import Link from "next/link";
import { FileX } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Demande absente ou inaccessible (spec 057) — un même message dans les deux cas, pour ne rien
 * apprendre de l'existence d'une demande à qui n'y a pas droit.
 */
export default function ItemNotFound({ backHref, backLabel }: { readonly backHref: string; readonly backLabel: string }) {
  return (
    <EmptyState
      icon={FileX}
      title="Cette demande n'existe plus"
      description="Elle a peut-être été supprimée, ou vous n'y avez pas accès."
      action={
        <Link href={backHref} className="text-sm font-medium text-brand-text hover:underline">
          {backLabel}
        </Link>
      }
    />
  );
}
