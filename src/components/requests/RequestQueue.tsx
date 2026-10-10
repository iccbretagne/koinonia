"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox, Search, SearchX, X } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import StatusChip from "@/components/ui/StatusChip";
import EmptyState from "@/components/ui/EmptyState";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { useViewport } from "@/components/shell-state";
import {
  REQUEST_TYPE_LABEL,
  formatDeadline,
  groupByDeadline,
  matchesQuery,
  relativeDeadline,
  daysUntil,
} from "@/lib/request-queue";
import type { DonePage, QueueFunction } from "@/modules/planning";
import {
  STATUS_TONE,
  formatDate,
  requestTypeIcon,
  statusLabel,
  type ActOptions,
  type DetailContext,
  type QueueItem,
  type RequestChange,
} from "./queue-types";

/**
 * File de traitement des demandes d'une équipe (spec 063) : onglets À traiter / En cours /
 * Traitées avec compteurs, file triée par échéance et regroupée, recherche, pastilles de type,
 * lignes compactes et panneau de détail (colonne sur desktop, feuille du bas sinon). Les actions
 * propres à l'équipe sont fournies par `renderDetail`.
 */

type TabKey = "todo" | "doing" | "done";

export interface TypeFilter {
  readonly key: string;
  readonly label: string;
  readonly types: readonly string[];
}

export interface RequestQueueProps {
  readonly churchId: string;
  readonly fn: QueueFunction;
  readonly initialOpen: QueueItem[];
  readonly initialDone: DonePage;
  readonly initialDoneCount: number;
  /** Libellé de l'état terminé propre à l'équipe : « Diffusée », « Publiée », « Livré ». */
  readonly doneLabel: string;
  readonly typeFilters?: readonly TypeFilter[];
  readonly renderDetail: (item: QueueItem, ctx: DetailContext) => ReactNode;
}

const OPEN_STATUSES = new Set(["EN_ATTENTE", "EN_COURS"]);

const TAB_EMPTY: Record<TabKey, { title: string; description: string }> = {
  todo: { title: "Rien à traiter", description: "Les nouvelles demandes apparaîtront ici." },
  doing: { title: "Aucune demande en cours", description: "Les demandes mises en cours restent ici jusqu'à leur clôture." },
  done: { title: "Aucune demande traitée", description: "Les demandes traitées des 30 derniers jours apparaissent ici." },
};

function parseTab(value: string | null): TabKey {
  return value === "doing" || value === "done" ? value : "todo";
}

/** Fusionne localement le résultat d'une modification (le serveur ne renvoie que le statut). */
function applyChange(item: QueueItem, change: RequestChange, status: string, executionError: string | null): QueueItem {
  const payload = { ...item.payload, ...(change.payload ?? {}) };
  if (change.deliveryLink !== undefined) payload.deliveryLink = change.deliveryLink;
  const cascade = status === "ANNULE" && (item.type === "DIFFUSION_INTERNE" || item.type === "RESEAUX_SOCIAUX");
  return {
    ...item,
    status: status as QueueItem["status"],
    payload,
    reviewNotes: change.reviewNotes ?? item.reviewNotes,
    executionError: executionError ?? item.executionError,
    updatedAt: new Date().toISOString(),
    children: cascade ? item.children.map((c) => ({ ...c, status: "ANNULE" as const })) : item.children,
  };
}

async function patchRequest(id: string, body: RequestChange & { expectedStatus: string }) {
  const res = await fetch(`/api/requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json, error: (json?.error as string | undefined) ?? null };
}

export default function RequestQueue({
  churchId,
  fn,
  initialOpen,
  initialDone,
  initialDoneCount,
  doneLabel,
  typeFilters,
  renderDetail,
}: RequestQueueProps) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewport = useViewport();
  const tab = parseTab(searchParams.get("tab"));

  const [open, setOpen] = useState<QueueItem[]>(initialOpen);
  const [done, setDone] = useState<QueueItem[]>(initialDone.items);
  const [doneCursor, setDoneCursor] = useState<string | null>(initialDone.nextCursor);
  const [doneCount, setDoneCount] = useState(initialDoneCount);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Recherche dans tout l'historique des demandes traitées (route dédiée).
  const [search, setSearch] = useState<{ q: string; items: QueueItem[]; cursor: string | null } | null>(null);
  const [now] = useState(() => new Date());

  const allItems = useMemo(() => [...open, ...done, ...(search?.items ?? [])], [open, done, search]);
  const selected = selectedId ? (allItems.find((i) => i.id === selectedId) ?? null) : null;

  const typeOk = useCallback(
    (item: QueueItem) => {
      if (!typeFilters || typeFilter === "all") return true;
      return typeFilters.find((f) => f.key === typeFilter)?.types.includes(item.type) ?? true;
    },
    [typeFilters, typeFilter]
  );

  const visible = useMemo(() => {
    if (tab === "done") {
      const source = search && query.trim() ? search.items : done;
      return source.filter(typeOk);
    }
    const status = tab === "todo" ? "EN_ATTENTE" : "EN_COURS";
    return open.filter((i) => i.status === status && typeOk(i) && matchesQuery(i, query));
  }, [tab, open, done, search, query, typeOk]);

  const counts = {
    todo: open.filter((i) => i.status === "EN_ATTENTE").length,
    doing: open.filter((i) => i.status === "EN_COURS").length,
    done: doneCount,
  };

  // Recherche serveur dans « Traitées », 300 ms après la dernière frappe.
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (tab !== "done" || !q) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ churchId, fn, q });
        const res = await fetch(`/api/requests/queue?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Recherche impossible");
        if (seq === searchSeq.current) setSearch({ q, items: json.items, cursor: json.nextCursor });
      } catch (e) {
        if (seq === searchSeq.current) toast.error(e instanceof Error ? e.message : "Recherche impossible");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab, churchId, fn, toast]);

  async function loadMore() {
    const searching = tab === "done" && search && query.trim();
    const cursor = searching ? search.cursor : doneCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ churchId, fn, cursor });
      if (searching) params.set("q", search.q);
      const res = await fetch(`/api/requests/queue?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Chargement impossible");
      const page = json as DonePage;
      if (searching) {
        setSearch({ ...search, items: [...search.items, ...page.items], cursor: page.nextCursor });
      } else {
        setDone((prev) => [...prev, ...page.items.filter((i) => !prev.some((p) => p.id === i.id))]);
        setDoneCursor(page.nextCursor);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoadingMore(false);
    }
  }

  /** Remplace la demande dans la bonne liste selon son nouvel état (et ajuste le compteur). */
  function place(next: QueueItem, previous: QueueItem) {
    const wasDone = !OPEN_STATUSES.has(previous.status);
    const isDone = !OPEN_STATUSES.has(next.status);
    setOpen((prev) => {
      const rest = prev.filter((i) => i.id !== next.id);
      return isDone ? rest : [...rest, next];
    });
    setDone((prev) => {
      const rest = prev.filter((i) => i.id !== next.id);
      return isDone ? [next, ...rest] : rest;
    });
    setSearch((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.id === next.id ? next : i)) } : prev));
    if (wasDone !== isDone) setDoneCount((c) => c + (isDone ? 1 : -1));
  }

  function handleConflict(message: string | null) {
    toast.error(message ?? "Cette demande a été modifiée entre-temps.");
    setSelectedId(null);
    router.refresh();
  }

  async function undo(previous: QueueItem, applied: QueueItem, change: RequestChange) {
    const res = await patchRequest(previous.id, { ...change, expectedStatus: applied.status });
    if (res.status === 409) return handleConflict("Retour impossible : la demande a été modifiée entre-temps.");
    if (!res.ok) {
      toast.error(res.error ?? "Retour impossible");
      return;
    }
    place(previous, applied);
    toast.info("Action annulée");
  }

  function contextFor(item: QueueItem): DetailContext {
    return {
      busy,
      act: async (change: RequestChange, options: ActOptions) => {
        setBusy(true);
        try {
          const res = await patchRequest(item.id, { ...change, expectedStatus: item.status });
          if (res.status === 409) {
            handleConflict(res.error);
            return false;
          }
          if (!res.ok) {
            toast.error(res.error ?? "Enregistrement impossible. Réessayez dans un instant.");
            return false;
          }
          const status = (res.data?.status as string | undefined) ?? change.status ?? item.status;
          const next = applyChange(item, change, status, (res.data?.executionError as string | undefined) ?? null);
          place(next, item);
          setSelectedId(null);
          if (status === "ERREUR") {
            toast.error(`Approuvée, mais l'exécution a échoué : ${next.executionError ?? "erreur inconnue"}`);
          } else {
            const undoChange = options.undo;
            toast.success(
              options.success,
              undoChange ? { action: { label: "Annuler", onClick: () => void undo(item, next, undoChange) } } : undefined
            );
          }
          return true;
        } catch {
          toast.error("Enregistrement impossible. Réessayez dans un instant.");
          return false;
        } finally {
          setBusy(false);
        }
      },
      remove: async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/requests/${item.id}`, { method: "DELETE" });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            toast.error(json.error ?? "Suppression impossible");
            return false;
          }
          setDone((prev) => prev.filter((i) => i.id !== item.id));
          setSearch((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id) } : prev));
          if (!OPEN_STATUSES.has(item.status)) setDoneCount((c) => Math.max(0, c - 1));
          setSelectedId(null);
          toast.success("Demande supprimée");
          return true;
        } catch {
          toast.error("Suppression impossible");
          return false;
        } finally {
          setBusy(false);
        }
      },
    };
  }

  const tabs = (["todo", "doing", "done"] as const).map((key) => ({
    href: `?tab=${key}`,
    // Le badge des onglets signale ce qui attend : l'historique affiche son compteur dans le libellé.
    label: key === "todo" ? "À traiter" : key === "doing" ? "En cours" : `Traitées (${counts.done})`,
    count: key === "done" ? undefined : counts[key],
    active: tab === key,
  }));

  const filtering = query.trim() !== "" || typeFilter !== "all";
  const showMore = tab === "done" && (search && query.trim() ? search.cursor : doneCursor);
  const isDesktop = viewport === "desktop";

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setSearch(null);
  }

  function renderRow(item: QueueItem) {
    const Icon = requestTypeIcon(item.type);
    const title = item.announcement?.title ?? item.title;
    const isSelected = item.id === selectedId;
    const days = item.deadline ? daysUntil(item.deadline, now) : null;
    const format = typeof item.payload.format === "string" ? item.payload.format : null;
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => setSelectedId(item.id)}
          aria-current={isSelected ? "true" : undefined}
          className={`flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-120
            focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
            ${isSelected ? "bg-brand-soft" : "hover:bg-surface-sunken"}`}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-[15px] font-semibold leading-[22px] text-ink">{title}</span>
              {item.announcement?.isUrgent && <StatusChip tone="danger">Urgent</StatusChip>}
              {item.announcement?.isSaveTheDate && <StatusChip tone="brand">Save the Date</StatusChip>}
              {item.type === "VISUEL" && !item.announcement && <StatusChip>Sans annonce</StatusChip>}
              {tab === "done" && (
                <StatusChip tone={STATUS_TONE[item.status] ?? "neutral"}>{statusLabel(item.status, doneLabel)}</StatusChip>
              )}
            </span>
            <span className="mt-0.5 block text-sm leading-5 text-ink-muted break-words">
              {REQUEST_TYPE_LABEL[item.type] ?? item.type}
              {format ? ` · ${format}` : ""} · {item.author}
              {item.source ? ` · ${item.source}` : ""}
            </span>
            {tab === "done" ? (
              <span className="mt-0.5 block text-sm leading-5 text-ink-subtle">Mise à jour le {formatDate(item.updatedAt)}</span>
            ) : (
              item.deadline && (
                <span className={`mt-0.5 block text-sm font-medium leading-5 ${days !== null && days < 0 ? "text-danger" : "text-ink-muted"}`}>
                  {formatDeadline(item.deadline)} · {relativeDeadline(item.deadline, now)}
                </span>
              )
            )}
          </span>
        </button>
      </li>
    );
  }

  function renderList() {
    if (visible.length === 0) {
      return filtering ? (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat"
          description="Aucune demande ne correspond à la recherche ou au filtre."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Effacer la recherche
            </Button>
          }
        />
      ) : (
        <EmptyState icon={Inbox} title={TAB_EMPTY[tab].title} description={TAB_EMPTY[tab].description} />
      );
    }
    if (tab === "done") {
      return <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{visible.map(renderRow)}</ul>;
    }
    return (
      <div className="flex flex-col gap-5">
        {groupByDeadline(visible, now).map((group) => (
          <section key={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-2">
            <h2
              id={`group-${group.key}`}
              className={`font-display text-[13px] font-bold uppercase leading-[18px] tracking-[0.06em] ${
                group.key === "overdue" ? "text-danger" : "text-ink-subtle"
              }`}
            >
              {group.label} · {group.items.length}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{group.items.map(renderRow)}</ul>
          </section>
        ))}
      </div>
    );
  }

  const detail = selected ? renderDetail(selected, contextFor(selected)) : null;
  const detailTitle = selected ? (selected.announcement?.title ?? selected.title) : "";

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} ariaLabel="États des demandes" />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setSearch(null);
            }}
            placeholder="Rechercher un titre, un demandeur, un département…"
            aria-label="Rechercher une demande"
            className="block min-h-11 w-full rounded-control border border-control-line bg-surface py-2 pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
          />
        </div>
        {typeFilters && (
          <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-2">
            {[{ key: "all", label: "Tout", types: [] as readonly string[] }, ...typeFilters].map((f) => {
              const pressed = typeFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setTypeFilter(f.key)}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-120
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                      pressed ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
                    }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={isDesktop ? "grid grid-cols-[minmax(0,1fr)_420px] items-start gap-6" : ""}>
        <div className="flex min-w-0 flex-col gap-4">
          {renderList()}
          {showMore && (
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore} className="self-center">
              {loadingMore ? "Chargement…" : "Voir plus"}
            </Button>
          )}
        </div>

        {isDesktop && (
          <aside
            aria-label="Détail de la demande"
            className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-surface"
          >
            {selected ? (
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words font-display text-[17px] font-semibold leading-6 text-ink">{detailTitle}</h2>
                  <IconButton icon={X} aria-label="Fermer" onClick={() => setSelectedId(null)} />
                </div>
                {detail}
              </div>
            ) : (
              <EmptyState size="sm" title="Aucune demande sélectionnée" description="Choisissez une demande dans la liste pour la traiter." />
            )}
          </aside>
        )}
      </div>

      {!isDesktop && (
        <BottomSheet open={selected !== null} onClose={() => setSelectedId(null)} title={detailTitle}>
          <div className="flex flex-col gap-4 px-4 pb-6 pt-2">{detail}</div>
        </BottomSheet>
      )}
    </div>
  );
}
