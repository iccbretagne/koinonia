import { Lock } from "lucide-react";
import Button from "@/components/ui/Button";

interface Props {
  readonly isSystem?: boolean;
  /** Seul un Super Admin modifie ou supprime une entrée système. */
  readonly isSuperAdmin?: boolean;
  /** Infobulle du cadenas, ex. « Département système ». */
  readonly systemLabel: string;
  readonly onEdit: () => void;
  /** Ouvre la confirmation de suppression (le `Dialog` porte le bouton `danger`). */
  readonly onDelete: () => void;
}

/** Actions d'une ligne de ministère ou de département, verrouillées pour une entrée système. */
export default function SystemRowActions({ isSystem, isSuperAdmin, systemLabel, onEdit, onDelete }: Props) {
  const locked = !!isSystem && !isSuperAdmin;
  const lockedReason = locked ? `${systemLabel} : modifiable par un Super Admin uniquement` : undefined;
  return (
    <div className="flex items-center gap-2 justify-end">
      {isSystem && (
        <span title={systemLabel} className="text-ink-subtle">
          <Lock aria-label={systemLabel} className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={onEdit} disabled={locked} title={lockedReason}>
        Modifier
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={locked} title={lockedReason}>
        Supprimer
      </Button>
    </div>
  );
}
