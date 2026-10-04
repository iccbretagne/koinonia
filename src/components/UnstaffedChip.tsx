import { UserX } from "lucide-react";
import StatusChip from "@/components/ui/StatusChip";

/**
 * Repère d'un événement à venir dont des départements n'ont aucun STAR planifié (agenda de
 * l'église, accueil) — affiché seulement à qui peut planifier, jamais imprimé.
 */
export default function UnstaffedChip({ count }: { readonly count: number }) {
  return (
    <StatusChip
      tone="warning"
      icon={UserX}
      title={`${count} département${count > 1 ? "s" : ""} prévu${count > 1 ? "s" : ""} sans STAR planifié`}
      className="shrink-0 print:hidden"
    >
      {count} dép. sans STAR
    </StatusChip>
  );
}
