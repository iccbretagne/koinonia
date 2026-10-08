import Button from "@/components/ui/Button";

interface Props {
  readonly isSystem?: boolean;
  /** Seul un Super Admin modifie ou supprime une entrée système. */
  readonly isSuperAdmin?: boolean;
  /** Infobulle du cadenas, ex. « Département système ». */
  readonly systemLabel: string;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/** Actions d'une ligne de ministère ou de département, verrouillées pour une entrée système. */
export default function SystemRowActions({ isSystem, isSuperAdmin, systemLabel, onEdit, onDelete }: Props) {
  const locked = !!isSystem && !isSuperAdmin;
  return (
    <div className="flex items-center gap-2 justify-end">
      {isSystem && (
        <span title={systemLabel} className="text-ink-subtle">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </span>
      )}
      <Button variant="secondary" onClick={onEdit} disabled={locked}>
        Modifier
      </Button>
      <Button variant="danger" onClick={onDelete} disabled={locked}>
        Supprimer
      </Button>
    </div>
  );
}
