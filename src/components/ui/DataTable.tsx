"use client";

import { ReactNode, useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import Checkbox from "./Checkbox";
import EmptyState from "./EmptyState";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  /** Rend l'en-tête cliquable pour trier sur cette colonne (avec `sort` + `onSortChange`). */
  sortKey?: string;
  /** Sens appliqué au premier clic sur cet en-tête (défaut : `"desc"`). */
  defaultSortDir?: "asc" | "desc";
  /**
   * Colonne titre de la ligne mobile (en gras, sans libellé). Défaut : la première colonne.
   */
  primary?: boolean;
  /** Masque la colonne dans la vue mobile (information secondaire). */
  hideOnMobile?: boolean;
  /** Alignement desktop ; `right` pour les nombres (chiffres tabulaires). */
  align?: "left" | "right";
}

export interface DataTableSort {
  key: string;
  dir: "asc" | "desc";
}

function ariaSort(sortKey: string | undefined, sort: DataTableSort | undefined): "ascending" | "descending" | undefined {
  if (!sortKey || sort?.key !== sortKey) return undefined;
  return sort.dir === "asc" ? "ascending" : "descending";
}

interface DataTableProps<T> {
  readonly columns: Column<T>[];
  readonly data: T[];
  readonly actions?: (row: T) => ReactNode;
  readonly emptyMessage?: string;
  /** Remplace l'état vide par défaut (`EmptyState` reprenant `emptyMessage`). */
  readonly emptyState?: ReactNode;
  readonly selectable?: boolean;
  readonly selectedIds?: Set<string>;
  readonly onSelectionChange?: (ids: Set<string>) => void;
  /** Id de ligne à mettre en évidence visuellement (ex. arrivée depuis un lien externe). */
  readonly highlightedId?: string;
  /**
   * Tri actif. `DataTable` ne trie pas les données lui-même : il affiche l'état
   * et remonte les changements via `onSortChange` — le parent trie ses données.
   */
  readonly sort?: DataTableSort;
  readonly onSortChange?: (sort: DataTableSort) => void;
}

function getCellValue<T>(row: T, accessor: Column<T>["accessor"]): ReactNode {
  return typeof accessor === "function" ? accessor(row) : (row[accessor] as ReactNode);
}

/** Libellé textuel d'une ligne pour le nom accessible de sa case à cocher. */
function rowLabel(value: ReactNode, index: number): string {
  return typeof value === "string" || typeof value === "number"
    ? `Sélectionner ${value}`
    : `Sélectionner la ligne ${index + 1}`;
}

/**
 * Liste de données (docs/design-system/components/DataTable.md) : tableau sur desktop, lignes
 * compactes sur mobile (titre, puis les autres colonnes en paires libellé/valeur serrées).
 */
export default function DataTable<T extends { id: string }>({
  columns,
  data,
  actions,
  emptyMessage = "Aucune donnée.",
  emptyState,
  selectable = false,
  selectedIds,
  onSelectionChange,
  highlightedId,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  const allSelected = selectable && data.length > 0 && data.every((row) => selectedIds?.has(row.id));
  const someSelected = selectable && data.some((row) => selectedIds?.has(row.id)) && !allSelected;

  const sortableColumns = onSortChange ? columns.filter((c) => c.sortKey) : [];
  const primaryIndex = Math.max(0, columns.findIndex((c) => c.primary));
  const primaryColumn = columns[primaryIndex];

  // La ligne existe deux fois (carte mobile, rangée desktop) : on fait défiler jusqu'à celle qui
  // est affichée. L'appelant peut aussi viser `#row-<id>` (rangée desktop).
  // Une seule fois par id : les données peuvent arriver après le montage, mais un filtrage
  // ultérieur ne doit pas ramener la page sur la ligne.
  const scrolledTo = useRef<string | null>(null);
  const hasRows = data.length > 0;
  useEffect(() => {
    if (!highlightedId || !hasRows || scrolledTo.current === highlightedId) return;
    const visible = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(highlightedId)}"]`),
    ).find((el) => el.offsetParent !== null);
    if (!visible) return;
    visible.scrollIntoView({ behavior: "smooth", block: "center" });
    scrolledTo.current = highlightedId;
  }, [highlightedId, hasRows]);

  function handleHeaderSort(key: string) {
    if (!onSortChange) return;
    if (sort?.key === key) {
      onSortChange({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      const col = columns.find((c) => c.sortKey === key);
      onSortChange({ key, dir: col?.defaultSortDir ?? "desc" });
    }
  }

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((row) => row.id)));
    }
  }

  function toggleRow(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  function rowState(id: string): "highlighted" | "selected" | "none" {
    if (id === highlightedId) return "highlighted";
    if (selectedIds?.has(id)) return "selected";
    return "none";
  }

  if (data.length === 0) {
    return emptyState ?? <EmptyState title={emptyMessage} size="sm" />;
  }

  function sortIcon(colKey: string) {
    if (sort?.key !== colKey) {
      return <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" strokeWidth={1.75} />;
    }
    const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
    return <Icon aria-hidden="true" className="size-3.5 text-brand-text" strokeWidth={2} />;
  }

  const mobileRowBg = {
    highlighted: "bg-accent-soft",
    selected: "bg-brand-soft",
    none: "bg-surface",
  };
  const desktopRowBg = {
    highlighted: "bg-accent-soft",
    selected: "bg-brand-soft",
    none: "hover:bg-surface-sunken",
  };

  return (
    <>
      {/* Mobile : tri (pas d'en-tête de colonne sur la vue en lignes) */}
      {sortableColumns.length > 0 && sort && onSortChange && (
        <div className="mb-3 flex items-end gap-2 md:hidden">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 font-display text-[13px] font-semibold leading-[18px] text-ink">
            <span>Trier par</span>
            <span className="relative">
              <select
                value={sort.key}
                onChange={(e) => handleHeaderSort(e.target.value)}
                className="block min-h-11 w-full cursor-pointer appearance-none rounded-control border border-control-line bg-surface py-2.5 pl-3 pr-10
                  font-sans text-base font-normal leading-6 text-ink focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
              >
                {sortableColumns.map((col) => (
                  <option key={col.sortKey} value={col.sortKey}>
                    {col.header}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                strokeWidth={1.75}
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => onSortChange({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })}
            className="grid size-11 shrink-0 place-items-center rounded-control border border-control-line bg-surface text-ink
              hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-label={sort.dir === "asc" ? "Ordre croissant, inverser" : "Ordre décroissant, inverser"}
            title={sort.dir === "asc" ? "Ordre croissant" : "Ordre décroissant"}
          >
            {sort.dir === "asc" ? (
              <ArrowUp aria-hidden="true" className="size-5" strokeWidth={1.75} />
            ) : (
              <ArrowDown aria-hidden="true" className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      )}

      {/* Mobile : lignes compactes */}
      <div className="overflow-hidden rounded-card border border-line bg-surface md:hidden">
        {selectable && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-line bg-surface-sunken px-4 py-2 text-[13px] font-semibold leading-[18px] text-ink-muted">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
            />
            Tout sélectionner
          </label>
        )}
        <ul className="divide-y divide-line">
          {data.map((row, index) => {
            const title = getCellValue(row, primaryColumn.accessor);
            const state = rowState(row.id);
            const details = columns.filter((col, i) => i !== primaryIndex && !col.hideOnMobile);
            return (
              <li
                key={row.id}
                data-row-id={row.id}
                className={`flex gap-3 px-4 py-3 transition-colors ${mobileRowBg[state]}`}
              >
                {selectable && (
                  <Checkbox
                    className="mt-0.5"
                    checked={selectedIds?.has(row.id) || false}
                    onChange={() => toggleRow(row.id)}
                    aria-label={rowLabel(title, index)}
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="min-w-0 break-words text-[15px] font-semibold leading-[22px] text-ink">{title}</div>
                  {details.length > 0 && (
                    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] leading-[18px]">
                      {details.map((col, i) => (
                        <div key={i} className="contents">
                          <dt className="max-w-[9rem] text-ink-subtle">{col.header}</dt>
                          <dd className="min-w-0 break-words text-ink">{getCellValue(row, col.accessor)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {actions && <div className="mt-1 flex flex-wrap items-center justify-end gap-2">{actions(row)}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Desktop : tableau */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px] leading-[22px]">
            <thead>
              <tr className="bg-surface-sunken">
                {selectable && (
                  <th scope="col" className="w-12 px-4 py-2.5">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                      aria-label="Tout sélectionner"
                    />
                  </th>
                )}
                {columns.map((col, i) => {
                  const sortable = !!col.sortKey && !!onSortChange;
                  return (
                    <th
                      key={i}
                      scope="col"
                      aria-sort={ariaSort(col.sortKey, sort)}
                      className={`whitespace-nowrap px-4 py-2.5 font-display text-xs font-semibold uppercase leading-4 tracking-[0.04em] text-ink-muted ${
                        col.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => handleHeaderSort(col.sortKey!)}
                          className={`-mx-1 inline-flex items-center gap-1 rounded-chip px-1 py-0.5 uppercase tracking-[0.04em] hover:text-ink
                            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                              sort?.key === col.sortKey ? "text-ink" : ""
                            }`}
                        >
                          {col.header}
                          {sortIcon(col.sortKey!)}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {actions && (
                  <th
                    scope="col"
                    className="whitespace-nowrap px-4 py-2.5 text-right font-display text-xs font-semibold uppercase leading-4 tracking-[0.04em] text-ink-muted"
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => {
                const state = rowState(row.id);
                return (
                  <tr
                    key={row.id}
                    id={`row-${row.id}`}
                    data-row-id={row.id}
                    data-selected={state === "selected" || undefined}
                    className={`border-t border-line transition-colors ${desktopRowBg[state]}`}
                  >
                    {selectable && (
                      <td className="w-12 px-4 py-3 align-middle">
                        <Checkbox
                          checked={selectedIds?.has(row.id) || false}
                          onChange={() => toggleRow(row.id)}
                          aria-label={rowLabel(getCellValue(row, primaryColumn.accessor), index)}
                        />
                      </td>
                    )}
                    {columns.map((col, i) => (
                      <td
                        key={i}
                        className={`px-4 py-3 align-middle text-ink ${
                          col.align === "right" ? "text-right tabular-nums" : ""
                        }`}
                      >
                        {getCellValue(row, col.accessor)}
                      </td>
                    ))}
                    {actions && (
                      <td className="whitespace-nowrap px-4 py-3 text-right align-middle">{actions(row)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
