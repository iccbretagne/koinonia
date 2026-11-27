"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Download, Images, Search, Share2, SlidersHorizontal, Users, X } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { FilterChip, Input, SearchInput, Select, buttonClasses, fieldLabelClasses } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import MediaLightbox from "@/components/media/MediaLightbox";
import CollectionBuilder from "../collections/CollectionBuilder";
import GalleryGrantsDialog from "./GalleryGrantsDialog";

interface Source {
  type: "event" | "project";
  id: string;
  name: string;
}

interface Item {
  kind: "photo" | "file";
  id: string;
  filename: string;
  date: string;
  width: number | null;
  height: number | null;
  thumbnailUrl: string;
  source: Source;
}

interface Page {
  items: Item[];
  nextCursor: string | null;
  total: number;
}

export interface GalleryFiltersState {
  type: "all" | "photos" | "visuals";
  from?: string;
  to?: string;
  source?: string;
  q?: string;
  order: "desc" | "asc";
}

const ZIP_MAX = 200;
const TYPE_LABELS = { all: "Tous", photos: "Photos", visuals: "Visuels" } as const;
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

const itemKey = (i: Pick<Item, "kind" | "id">) => `${i.kind}:${i.id}`;

function toSearch(f: GalleryFiltersState): string {
  const p = new URLSearchParams();
  if (f.type !== "all") p.set("type", f.type);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.source) p.set("source", f.source);
  if (f.q) p.set("q", f.q);
  if (f.order !== "desc") p.set("order", f.order);
  return p.toString();
}

/** Regroupe les éléments (déjà triés) par mois, dans l'ordre d'arrivée. */
function groupByMonth(items: Item[]): { label: string; items: Item[] }[] {
  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const label = monthFmt.format(new Date(item.date));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export default function GalleryClient({
  churchId,
  filters,
  initialPage,
  canShare,
  shareScope,
  originAccess,
  canManageGrants,
}: {
  readonly churchId: string;
  readonly filters: GalleryFiltersState;
  readonly initialPage: Page;
  readonly canShare: boolean;
  readonly shareScope: { photos: boolean; visuals: boolean };
  readonly originAccess: { photos: boolean; visuals: boolean };
  readonly canManageGrants: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [items, setItems] = useState(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(filters.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [grantsOpen, setGrantsOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, Item>>(new Map());
  const [zipping, setZipping] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const apply = useCallback(
    (patch: Partial<GalleryFiltersState>) => {
      const qs = toSearch({ ...filters, ...patch });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router]
  );

  // Recherche : appliquée après une courte pause de frappe.
  useEffect(() => {
    if (search === (filters.q ?? "")) return;
    const t = setTimeout(() => apply({ q: search.trim() || undefined }), 400);
    return () => clearTimeout(t);
  }, [search, filters.q, apply]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadError(false);
    try {
      const qs = toSearch(filters);
      const res = await fetch(`/api/media/library?${qs}${qs ? "&" : ""}cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(`Chargement de la galerie impossible (${res.status})`);
      const page: Page = await res.json();
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, filters]);

  // Défilement continu : charge la page suivante quand la sentinelle approche de l'écran.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  const groups = useMemo(() => groupByMonth(items), [items]);
  const indexOf = useMemo(() => new Map(items.map((it, i) => [itemKey(it), i])), [items]);

  function toggle(item: Item) {
    setSelected((prev) => {
      const next = new Map(prev);
      const k = itemKey(item);
      if (next.has(k)) next.delete(k);
      else next.set(k, item);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Map());
  }

  const selection = [...selected.values()];
  const selectedPhotos = selection.filter((i) => i.kind === "photo");
  const selectedFiles = selection.filter((i) => i.kind === "file");
  // Les collections ne partagent que les visuels rangés dans un projet.
  const shareableFiles = selectedFiles.filter((f) => f.source.type === "project");
  const shareAllowed =
    canShare &&
    selection.length > 0 &&
    (selectedPhotos.length === 0 || shareScope.photos) &&
    (shareableFiles.length === 0 || shareScope.visuals) &&
    selectedPhotos.length + shareableFiles.length > 0;

  async function downloadZip() {
    if (selection.length === 0 || selection.length > ZIP_MAX) return;
    setZipping(true);
    try {
      const res = await fetch("/api/media/library/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selectedPhotos.map((i) => i.id), fileIds: selectedFiles.map((i) => i.id) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Téléchargement impossible");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `galerie-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    } finally {
      setZipping(false);
    }
  }

  const activeChips: { key: string; label: string; clear: Partial<GalleryFiltersState> }[] = [];
  if (filters.type !== "all") activeChips.push({ key: "type", label: TYPE_LABELS[filters.type], clear: { type: "all" } });
  if (filters.from || filters.to) {
    const f = filters.from ? dayFmt.format(new Date(`${filters.from}T12:00:00Z`)) : "…";
    const t = filters.to ? dayFmt.format(new Date(`${filters.to}T12:00:00Z`)) : "…";
    activeChips.push({ key: "period", label: `${f} → ${t}`, clear: { from: undefined, to: undefined } });
  }
  if (filters.source) {
    const name = items.find((i) => `${i.source.type}:${i.source.id}` === filters.source)?.source.name;
    activeChips.push({ key: "source", label: name ?? (filters.source.startsWith("event") ? "Événement" : "Projet"), clear: { source: undefined } });
  }
  if (filters.q) activeChips.push({ key: "q", label: `« ${filters.q} »`, clear: { q: undefined } });
  const hasFilters = activeChips.length > 0;

  function clearAll() {
    setSearch("");
    router.replace(filters.order === "asc" ? `${pathname}?order=asc` : pathname, { scroll: false });
  }

  /** Lien vers l'origine, seulement si l'écran correspondant est accessible. */
  function originHref(item: Item): string | null {
    if (item.source.type === "project") return originAccess.visuals ? `/media/projects/${item.source.id}` : null;
    if (item.kind === "photo" && originAccess.photos) return `/media/events/${item.source.id}`;
    return null;
  }

  return (
    <div className={selecting ? "pb-24" : ""}>
      <PageHeader
        title="Galerie"
        description={`${initialPage.total} média${initialPage.total > 1 ? "s" : ""} validé${initialPage.total > 1 ? "s" : ""}${hasFilters ? " pour ces filtres" : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {canManageGrants && (
              <Button variant="secondary" onClick={() => setGrantsOpen(true)}>
                <Users className="w-4 h-4" aria-hidden="true" /> Gérer les accès
              </Button>
            )}
            {items.length > 0 && !selecting && (
              <Button variant="secondary" onClick={() => setSelecting(true)}>
                <Check className="w-4 h-4" aria-hidden="true" /> Sélectionner
              </Button>
            )}
          </div>
        }
      />

      {/* Barre de filtres */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-bg/95 backdrop-blur-sm border-b border-line space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type de média">
            {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => (
              <FilterChip key={t} pressed={filters.type === t} onClick={() => apply({ type: t })}>
                {TYPE_LABELS[t]}
              </FilterChip>
            ))}
          </div>
          <SearchInput aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="flex-1 min-w-40" />
          <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> Filtrer
          </Button>
          <div className="w-40">
            <Select
              label=""
              aria-label="Tri"
              value={filters.order}
              onChange={(e) => apply({ order: e.target.value as "desc" | "asc" })}
              options={[{ value: "desc", label: "Plus récent" }, { value: "asc", label: "Plus ancien" }]}
            />
          </div>
        </div>
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map((c) => (
              <FilterChip
                key={c.key}
                pressed
                onClick={() => {
                  if (c.key === "q") {
                    setSearch("");
                  }
                  apply(c.clear);
                }}
                aria-label={`Retirer le filtre ${c.label}`}
              >
                {c.label} <X className="size-4" aria-hidden="true" strokeWidth={1.75} />
              </FilterChip>
            ))}
            <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={clearAll}>Effacer les filtres</Button>
          </div>
        )}
      </div>

      {/* Grille */}
      {items.length === 0 ? (
        <div className="py-10">
          {hasFilters ? (
            <EmptyState
              icon={Search}
              title="Aucun résultat"
              description="Aucun média validé ne correspond à ces filtres."
              action={<Button variant="secondary" onClick={clearAll}>Effacer les filtres</Button>}
            />
          ) : (
            <EmptyState
              icon={Images}
              title="Aucun média validé pour l'instant"
              description="Les photos et les visuels apparaissent ici une fois validés."
            />
          )}
        </div>
      ) : (
        <div className="space-y-6 pt-4">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="text-sm font-semibold text-ink-muted mb-2 first-letter:uppercase">{g.label}</h2>
              <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 sm:gap-2">
                {g.items.map((item) => {
                  const k = itemKey(item);
                  const isSelected = selected.has(k);
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => (selecting ? toggle(item) : setLightboxIndex(indexOf.get(k) ?? 0))}
                        aria-pressed={selecting ? isSelected : undefined}
                        aria-label={`${item.filename} — ${item.source.name}`}
                        className={`relative block w-full aspect-square overflow-hidden rounded-control bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${isSelected ? "ring-2 ring-brand" : ""}`}
                      >
                        {item.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumbnailUrl} alt="" loading="lazy" className={`w-full h-full object-cover transition-transform ${isSelected ? "scale-90 rounded-chip" : ""}`} />
                        ) : (
                          <span className="flex w-full h-full items-center justify-center text-xs text-ink-subtle">Aperçu indisponible</span>
                        )}
                        {item.kind === "file" && (
                          <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded-chip bg-surface/90 text-ink text-xs font-semibold">Visuel</span>
                        )}
                        {selecting && (
                          <span
                            className={`absolute right-1.5 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? "bg-brand border-brand text-on-brand" : "bg-surface/80 border-surface"}`}
                            aria-hidden="true"
                          >
                            {isSelected && <Check className="w-4 h-4" />}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div ref={sentinel} />
          {cursor !== null && (
            <div className="flex justify-center py-4">
              <Button variant="secondary" onClick={loadMore} disabled={loading}>
                {loading ? "Chargement en cours…" : loadError ? "Réessayer le chargement" : "Afficher plus de médias"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Barre de sélection */}
      {selecting && (
        <div
          data-k-bottom-bar
          className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4 inset-x-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-30 bg-surface border-t md:border border-line md:rounded-card shadow-float px-4 py-3 flex flex-wrap items-center gap-2 justify-between md:justify-center"
        >
          <span className="text-sm font-medium text-ink">
            {selection.length} sélectionné{selection.length > 1 ? "s" : ""}
            {selection.length > ZIP_MAX && <span className="block text-xs text-danger">{ZIP_MAX} au plus par archive</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={downloadZip} disabled={zipping || selection.length === 0 || selection.length > ZIP_MAX}>
              <Download className="w-4 h-4" aria-hidden="true" /> {zipping ? "Préparation en cours…" : "Télécharger la sélection"}
            </Button>
            {canShare && (
              <Button variant="secondary" onClick={() => setShareOpen(true)} disabled={!shareAllowed}>
                <Share2 className="w-4 h-4" aria-hidden="true" /> Partager la sélection
              </Button>
            )}
            <Button variant="ghost" onClick={stopSelecting}>Annuler la sélection</Button>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox
          items={items.map((i) => ({ ...i, src: i.thumbnailUrl || null, alt: i.filename }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(i) => {
            if (i >= items.length - 5) void loadMore();
          }}
          header={(item) => (
            <div className="min-w-0">
              {/* eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre */}
              <p className="text-sm text-white/80 truncate">{item.filename}</p>
              {/* eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre */}
              <p className="text-xs text-white/50 truncate">{dayFmt.format(new Date(item.date))} · {item.source.name}</p>
            </div>
          )}
          footer={(item) => {
            const href = originHref(item);
            return (
              <>
                <a
                  href={`/api/media/library/${item.kind}/${item.id}/download`}
                  className={buttonClasses("primary")}
                >
                  <Download className="w-4 h-4" aria-hidden="true" /> Télécharger le média
                </a>
                {href !== null && (
                  // eslint-disable-next-line no-restricted-syntax -- visionneuse plein écran toujours sombre : bouton clair sur fond noir
                  <Link href={href} className="inline-flex min-h-11 items-center rounded-control border border-white/30 px-4 font-display text-sm font-semibold text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    {item.source.type === "event" ? "Voir dans l'événement" : "Voir dans le projet"}
                  </Link>
                )}
              </>
            );
          }}
        />
      )}

      <FiltersDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onApply={(p) => { apply(p); setFiltersOpen(false); }} />

      {canShare && (
        <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Partager la sélection" size="lg">
          {shareableFiles.length < selectedFiles.length && (
            <p className="text-sm text-ink-muted mb-3">
              Les visuels rangés dans un événement ne peuvent pas être partagés par lien : ils sont retirés de ce partage.
            </p>
          )}
          <CollectionBuilder
            churchId={churchId}
            events={[]}
            projects={[]}
            selection={{
              photoIds: selectedPhotos.map((i) => i.id),
              fileIds: shareableFiles.map((i) => i.id),
              eventIds: [...new Set(selectedPhotos.map((i) => i.source.id))],
              projectIds: [...new Set(shareableFiles.map((i) => i.source.id))],
            }}
          />
        </Modal>
      )}

      {canManageGrants && <GalleryGrantsDialog open={grantsOpen} onClose={() => setGrantsOpen(false)} />}
    </div>
  );
}

/** Période et événement ou projet : deux filtres regroupés dans une feuille (spec 080). */
function FiltersDialog({
  open,
  onClose,
  filters,
  onApply,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly filters: GalleryFiltersState;
  readonly onApply: (patch: Partial<GalleryFiltersState>) => void;
}) {
  const uid = useId();
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [source, setSource] = useState(filters.source ?? "");
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<Source[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/media/library/sources${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setSources)
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [open, q]);

  return (
    <Modal open={open} onClose={onClose} title="Filtres" mobileLayout="sheet">
      <div className="space-y-5">
        <fieldset>
          <legend className={`${fieldLabelClasses} mb-2`}>Période</legend>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Du" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Au" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className={`${fieldLabelClasses} mb-2`}>Événement ou projet</legend>
          <SearchInput aria-label="Rechercher un événement ou un projet" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
          <ul className="mt-2 max-h-56 overflow-y-auto border border-line rounded-control divide-y divide-line">
            <li>
              <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-[15px] text-ink cursor-pointer">
                <input className="size-5 shrink-0 accent-brand" type="radio" name={`${uid}-source`} checked={source === ""} onChange={() => setSource("")} /> Tous
              </label>
            </li>
            {sources === null && <li className="px-3 py-2 text-sm text-ink-subtle">Chargement…</li>}
            {sources?.map((s) => {
              const value = `${s.type}:${s.id}`;
              return (
                <li key={value}>
                  <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-[15px] text-ink cursor-pointer">
                    <input className="size-5 shrink-0 accent-brand" type="radio" name={`${uid}-source`} checked={source === value} onChange={() => setSource(value)} />
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto text-xs text-ink-subtle shrink-0">{s.type === "event" ? "Événement" : "Projet"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setSource(""); }}>Réinitialiser les filtres</Button>
          <Button variant="primary" onClick={() => onApply({ from: from || undefined, to: to || undefined, source: source || undefined })}>
            Appliquer les filtres
          </Button>
        </div>
      </div>
    </Modal>
  );
}
