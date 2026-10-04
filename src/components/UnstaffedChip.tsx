import { UserX } from "lucide-react";

/**
 * Repère d'un événement à venir dont des départements n'ont aucun STAR planifié (agenda de
 * l'église, accueil) — affiché seulement à qui peut planifier, jamais imprimé.
 */
export default function UnstaffedChip({ count }: { readonly count: number }) {
  return (
    <span
      title={`${count} département${count > 1 ? "s" : ""} prévu${count > 1 ? "s" : ""} sans STAR planifié`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning print:hidden"
    >
      <UserX aria-hidden="true" className="size-3.5" strokeWidth={2} />
      {count} dép. sans STAR
    </span>
  );
}
