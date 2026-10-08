import type { ReactNode } from "react";

interface Props<T> {
  readonly pending: T[];
  readonly inProgress: T[];
  readonly done: T[];
  readonly renderItem: (item: T) => ReactNode;
  /** Nombre total de demandes (tous états) : le message vide ne s'affiche qu'à zéro. */
  readonly total: number;
  readonly emptyLabel: string;
}

/** File de demandes d'une équipe, groupée par état : en attente, en cours, terminées. */
export default function RequestStatusSections<T>({ pending, inProgress, done, renderItem, total, emptyLabel }: Props<T>) {
  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-ink mb-3 flex items-center gap-2">
            <span>En attente</span>
            <span className="bg-brand text-on-brand text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-4">{pending.map(renderItem)}</div>
        </section>
      )}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">En cours</h2>
          <div className="space-y-4">{inProgress.map(renderItem)}</div>
        </section>
      )}
      {done.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">Terminés</h2>
          <div className="space-y-4">{done.map(renderItem)}</div>
        </section>
      )}
      {total === 0 && (
        <div className="text-center py-12 text-ink-subtle">
          <p className="text-lg">{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}
