"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CornerDownLeft, ExternalLink, Search, UserRound, type LucideIcon } from "lucide-react";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { filterByQuery, normalizeText, type SearchablePage } from "@/lib/navigation";
import { resetLoadingToIdle, type Remote } from "./command-palette-remote";

/** Clé localStorage des pages récemment ouvertes depuis la palette (confort par personne). */
const RECENT_KEY = "koinonia-recent-pages";
const RECENT_MAX = 5;
const DEBOUNCE_MS = 250;
const MIN_REMOTE_QUERY = 2;
const PER_GROUP = 6;
/** Clé de filtre lue par la liste des STAR (`admin/members`), pour y arriver déjà filtré. */
const MEMBERS_SEARCH_KEY = "members_filter_search";

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly pages: readonly SearchablePage[];
  readonly churchId: string | null;
  /** `GET /api/members` (members:view, périmètre de l'appelant) : catégorie STAR. */
  readonly canSearchMembers: boolean;
  /** `GET /api/events` (events:view) : catégorie Événements. */
  readonly canSearchEvents: boolean;
}

interface Result {
  readonly id: string;
  readonly label: string;
  readonly context?: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly external?: boolean;
  /** Préfiltre de la liste des STAR à l'arrivée. */
  readonly memberSearch?: string;
}

interface Group {
  readonly key: string;
  readonly title: string;
  readonly results: readonly Result[];
}

interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  departments?: { department: { name: string } }[];
}

interface EventRow {
  id: string;
  title: string;
  date: string;
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(href: string) {
  try {
    const next = [href, ...readRecent().filter((h) => h !== href)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : pas d'historique, sans conséquence.
  }
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function pageResult(p: SearchablePage): Result {
  return { id: `page:${p.href}`, label: p.label, context: p.context, href: p.href, icon: p.icon, external: p.external };
}

/**
 * Palette de recherche (⌘K / Ctrl K, loupe en plein écran sur mobile —
 * docs/design-system/guidelines/10-navigation.md). Filtre instantanément les pages de la
 * navigation du rôle ; propose aussi des STAR et des événements via les routes de liste
 * existantes (`GET /api/members`, `GET /api/events`), avec le périmètre qu'elles appliquent
 * déjà : une catégorie refusée (403) ou indisponible est simplement masquée.
 */
export default function CommandPalette({ open, onClose, pages, churchId, canSearchMembers, canSearchEvents }: CommandPaletteProps) {
  const dialogRef = useModalDialog(open, onClose);
  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Rechercher"
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-surface p-0 text-ink backdrop:bg-scrim
        md:mx-auto md:mt-[12vh] md:h-fit md:max-h-[70vh] md:w-[min(640px,calc(100%-2rem))] md:rounded-card md:shadow-overlay"
    >
      <PaletteBody
        onClose={onClose}
        pages={pages}
        churchId={churchId}
        canSearchMembers={canSearchMembers}
        canSearchEvents={canSearchEvents}
      />
    </dialog>
  );
}

function PaletteBody({ onClose, pages, churchId, canSearchMembers, canSearchEvents }: Omit<CommandPaletteProps, "open">) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent] = useState(readRecent);
  const [members, setMembers] = useState<Remote<MemberRow>>({ status: canSearchMembers && churchId ? "idle" : "unavailable" });
  const [events, setEvents] = useState<Remote<EventRow>>({ status: canSearchEvents && churchId ? "idle" : "unavailable" });
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const wantsRemote = normalizeText(debounced).length >= MIN_REMOTE_QUERY;

  // Chargement paresseux, une fois par ouverture : les routes de liste n'ont pas de paramètre de
  // recherche, le filtrage se fait ensuite côté client sur ce que le périmètre autorise.
  useEffect(() => {
    if (!wantsRemote || !churchId) return;
    const controller = new AbortController();
    const load = async <T,>(url: string, set: (r: Remote<T>) => void) => {
      set({ status: "loading" });
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return set({ status: "unavailable" });
        const rows: unknown = await res.json();
        set(Array.isArray(rows) ? { status: "ready", rows: rows as T[] } : { status: "unavailable" });
      } catch {
        if (!controller.signal.aborted) set({ status: "unavailable" });
      }
    };
    const cid = encodeURIComponent(churchId);
    if (members.status === "idle") void load<MemberRow>(`/api/members?churchId=${cid}`, setMembers);
    if (events.status === "idle") void load<EventRow>(`/api/events?churchId=${cid}`, setEvents);
    return () => {
      controller.abort();
      // La requête annulée (repassage sous le seuil pendant le chargement) ne doit pas
      // laisser la catégorie bloquée sur "loading" (voir resetLoadingToIdle).
      setMembers(resetLoadingToIdle);
      setEvents(resetLoadingToIdle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul chargement par catégorie
  }, [wantsRemote, churchId]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    if (!q) {
      const byHref = new Map(pages.map((p) => [p.href, p]));
      const recentPages = recent.map((h) => byHref.get(h)).filter((p): p is SearchablePage => !!p);
      const quick = pages.filter((p) => !recent.includes(p.href)).slice(0, 8);
      return [
        { key: "recent", title: "Pages récentes", results: recentPages.map(pageResult) },
        { key: "quick", title: "Accès rapides", results: quick.map(pageResult) },
      ].filter((g) => g.results.length > 0);
    }

    const out: Group[] = [];
    const pageHits = filterByQuery(pages, q, (p) => `${p.label} ${p.context}`, (p) => p.label).slice(0, 8);
    if (pageHits.length > 0) out.push({ key: "pages", title: "Pages", results: pageHits.map(pageResult) });

    if (normalizeText(debounced).length >= MIN_REMOTE_QUERY) {
      if (members.status === "ready") {
        const hits = filterByQuery(
          members.rows,
          debounced,
          (m) => `${m.firstName} ${m.lastName} ${m.lastName} ${m.firstName}`,
          (m) => `${m.firstName} ${m.lastName}`
        ).slice(0, PER_GROUP);
        if (hits.length > 0) {
          out.push({
            key: "members",
            title: "STAR",
            results: hits.map((m) => {
              const name = `${m.firstName} ${m.lastName}`;
              return {
                id: `member:${m.id}`,
                label: name,
                context: m.departments?.map((d) => d.department.name).join(", ") || undefined,
                href: `/admin/members?q=${encodeURIComponent(name)}`,
                icon: UserRound,
                memberSearch: name,
              };
            }),
          });
        }
      }
      if (events.status === "ready") {
        const now = Date.now();
        const hits = filterByQuery(events.rows, debounced, (e) => e.title, (e) => e.title)
          // Les plus proches d'aujourd'hui d'abord (la route renvoie du plus récent au plus ancien).
          .sort((a, b) => Math.abs(new Date(a.date).getTime() - now) - Math.abs(new Date(b.date).getTime() - now))
          .slice(0, PER_GROUP);
        if (hits.length > 0) {
          out.push({
            key: "events",
            title: "Événements",
            results: hits.map((e) => ({
              id: `event:${e.id}`,
              label: e.title,
              context: dateFormat.format(new Date(e.date)),
              href: `/events/${e.id}/star-view`,
              icon: CalendarDays,
            })),
          });
        }
      }
    }
    return out;
  }, [query, debounced, pages, recent, members, events]);

  const flat = groups.flatMap((g) => g.results);
  const current = Math.min(activeIndex, Math.max(0, flat.length - 1));
  const loading =
    query.trim().length > 0 &&
    (query !== debounced || members.status === "loading" || events.status === "loading") &&
    normalizeText(query).length >= MIN_REMOTE_QUERY &&
    (members.status !== "unavailable" || events.status !== "unavailable");

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, groups]);

  function go(result: Result) {
    if (result.external) {
      window.open(result.href, "_blank", "noopener,noreferrer");
      onClose();
      return;
    }
    if (result.id.startsWith("page:")) pushRecent(result.href);
    if (result.memberSearch) {
      try {
        localStorage.setItem(MEMBERS_SEARCH_KEY, result.memberSearch);
      } catch {
        // Sans stockage, la liste s'ouvre simplement sans filtre.
      }
      // Déjà sur la liste : son filtre n'est lu qu'au montage, on la recharge.
      if (pathname === "/admin/members") {
        window.location.assign(result.href);
        return;
      }
    }
    onClose();
    router.push(result.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setActiveIndex((current + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActiveIndex((current - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[current]) go(flat[current]);
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let index = -1;

  return (
    <div className="flex h-full max-h-[inherit] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 md:px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-control text-ink-muted hover:bg-surface-sunken md:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
        <Search aria-hidden="true" className="hidden size-5 shrink-0 text-ink-subtle md:block" strokeWidth={1.75} />
        {/* `data-dialog-body` : useModalDialog y place le focus à l'ouverture (et non sur le retour). */}
        <div data-dialog-body className="flex min-w-0 flex-1">
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length > 0 ? optionId(current) : undefined}
            aria-label="Rechercher une page, un STAR, un événement"
            placeholder="Rechercher une page, un STAR, un événement…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent font-sans text-base text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>
        <kbd className="hidden rounded-chip border border-line px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-subtle md:inline">
          Échap
        </kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <ul ref={listRef} id={listId} role="listbox" aria-label="Résultats">
          {groups.map((g) => (
            <li key={g.key} role="presentation" className="mb-1">
              <p
                role="presentation"
                className="px-3 pb-1 pt-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle"
              >
                {g.title}
              </p>
              <ul role="group" aria-label={g.title}>
                {g.results.map((r) => {
                  index += 1;
                  const i = index;
                  const selected = i === current;
                  const Icon = r.icon;
                  return (
                    <li
                      key={r.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => setActiveIndex(i)}
                      onClick={() => go(r)}
                      onKeyDown={(e) => {
                        // Le clavier passe d'ordinaire par le champ (aria-activedescendant) ; ceci couvre l'option focalisée.
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          go(r);
                        }
                      }}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 ${
                        selected ? "bg-brand-soft" : ""
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-5 shrink-0 ${selected ? "text-brand-text" : "text-ink-subtle"}`}
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[15px] font-semibold ${selected ? "text-brand-text" : "text-ink"}`}>
                          {r.label}
                        </span>
                        {r.context && <span className="block truncate text-[13px] leading-[18px] text-ink-muted">{r.context}</span>}
                      </span>
                      {r.external && <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />}
                      {selected && <CornerDownLeft aria-hidden="true" className="hidden size-4 shrink-0 text-brand-text md:block" strokeWidth={1.75} />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {flat.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-ink-muted" role="status">
            {loading ? "Recherche…" : `Aucun résultat pour « ${query.trim()} ». Essayez un autre mot.`}
          </p>
        )}
        {flat.length > 0 && loading && (
          <p className="px-3 py-2 text-[13px] text-ink-subtle" role="status">
            Recherche des STAR et des événements…
          </p>
        )}
      </div>
    </div>
  );
}
