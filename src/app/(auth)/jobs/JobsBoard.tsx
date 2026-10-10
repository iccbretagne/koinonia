"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Copy, Laptop, SearchX, UserRoundSearch, Wrench, type LucideIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import FilterChip from "@/components/ui/FilterChip";
import Modal from "@/components/ui/Modal";
import SearchInput from "@/components/ui/SearchInput";
import StatusChip from "@/components/ui/StatusChip";
import Tabs from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import ListDetailLayout from "@/components/ListDetailLayout";
import type { Publication, PublicationKind } from "@/modules/jobs";
import PublicationDetail from "./PublicationDetail";
import PublishChooser from "./PublishChooser";
import { buildWhatsAppRecap, type RecapJobType } from "./whatsapp-recap";
import {
  CHIP_LABEL,
  STATE_LABEL,
  STATE_TONE,
  TAB_CHIPS,
  TAB_KINDS,
  TAB_LABEL,
  expiryLabel,
  isNewSince,
  matchesQuery,
  matchesState,
  matchesTypes,
  rateLabel,
  tabOf,
  typeLabel,
  type BoardTab,
  type StateFilter,
  type TypeChip,
} from "./board";

const KIND_ICON: Record<PublicationKind, LucideIcon> = {
  OFFER: Briefcase,
  MISSION: Wrench,
  SEEKER: UserRoundSearch,
  FREELANCE: Laptop,
};

const STATE_FILTERS: readonly { key: StateFilter; label: string }[] = [
  { key: "active", label: "Actives" },
  { key: "inactive", label: "Retirées" },
  { key: "all", label: "Toutes" },
];

const EMPTY: Record<BoardTab, { title: string; description: string }> = {
  opportunites: { title: "Aucune opportunité pour le moment", description: "Proposez une offre ou une mission à la communauté." },
  profils: { title: "Aucun profil disponible pour le moment", description: "Faites savoir que vous cherchez ou que vous proposez vos services." },
};

/**
 * Espace Offres (spec 064) : deux onglets (opportunités, profils disponibles), pastilles de type,
 * recherche, « Mes publications », filtre d'état pour la modération, liste compacte et panneau
 * de détail. Les données arrivent filtrées par visibilité depuis le serveur.
 */
export default function JobsBoard({
  publications,
  canManage,
  lastSeenAt,
  nowMs,
  tab,
  initialChips,
}: {
  readonly publications: readonly Publication[];
  readonly canManage: boolean;
  readonly lastSeenAt: string;
  readonly nowMs: number;
  readonly tab: BoardTab;
  readonly initialChips: readonly TypeChip[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<readonly TypeChip[]>(initialChips);
  const [mine, setMine] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  // Date de dernière visite figée au chargement : voir `isNewSince`.
  const [seenAt] = useState(lastSeenAt);
  const now = new Date(nowMs);

  const counts = useMemo(() => {
    const active = publications.filter((p) => p.state === "active");
    return {
      opportunites: active.filter((p) => tabOf(p.kind) === "opportunites").length,
      profils: active.filter((p) => tabOf(p.kind) === "profils").length,
    };
  }, [publications]);

  const visible = useMemo(
    () =>
      publications.filter(
        (p) =>
          TAB_KINDS[tab].includes(p.kind) &&
          matchesState(p, stateFilter, { canManage, mine }) &&
          matchesTypes(p, chips) &&
          matchesQuery(p, query)
      ),
    [publications, tab, stateFilter, canManage, mine, chips, query]
  );

  const selected = publications.find((p) => p.id === selectedId) ?? null;
  const filtering = query.trim() !== "" || chips.length > 0 || mine || stateFilter !== "active";

  function toggleChip(chip: TypeChip) {
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  function clearFilters() {
    setQuery("");
    setChips([]);
    setMine(false);
    setStateFilter("active");
  }

  const recapItems = visible.filter((p) => p.state === "active");

  async function copyRecap() {
    const text = buildWhatsAppRecap(
      recapItems.map((p) => ({
        id: p.id,
        title: p.title,
        type: (p.kind === "MISSION" ? "MISSION" : p.contractTypes[0]) as RecapJobType,
        company: p.organization ?? "",
        location: p.location,
        deadline: p.deadline,
      })),
      chips.filter((c): c is RecapJobType => c !== "FREELANCE"),
      window.location.origin
    );
    try {
      // En contexte non sécurisé, `navigator.clipboard` est absent : repli sur la copie manuelle.
      if (!navigator.clipboard) throw new Error("presse-papier indisponible");
      await navigator.clipboard.writeText(text);
      const n = recapItems.length;
      toast.success(`Message copié : ${n} opportunité${n > 1 ? "s" : ""}`);
    } catch {
      setFallbackText(text);
    }
  }

  const tabs = (["opportunites", "profils"] as const).map((key) => ({
    href: `?tab=${key}`,
    label: `${TAB_LABEL[key]} (${counts[key]})`,
    active: tab === key,
  }));

  function renderCard(pub: Publication) {
    const Icon = KIND_ICON[pub.kind];
    const isSelected = pub.id === selectedId;
    const expiry = pub.kind === "OFFER" && pub.state === "active" ? expiryLabel(pub.deadline, now) : null;
    const rate = pub.kind === "MISSION" || pub.kind === "FREELANCE" ? rateLabel(pub.dailyRate, pub.hourlyRate) : null;
    const isNew = isNewSince(pub, seenAt);
    return (
      <li key={pub.id}>
        <button
          type="button"
          onClick={() => setSelectedId(pub.id)}
          aria-current={isSelected ? "true" : undefined}
          className={`flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-120
            focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
            ${isSelected ? "bg-brand-soft" : "hover:bg-surface-sunken"}`}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {isNew && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-text">
                  <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                  Nouveau
                </span>
              )}
              <span className="min-w-0 break-words text-[15px] font-semibold leading-[22px] text-ink">{pub.title}</span>
              {pub.state !== "active" && <StatusChip tone={STATE_TONE[pub.state]}>{STATE_LABEL[pub.state]}</StatusChip>}
            </span>
            <span className="mt-0.5 block break-words text-sm leading-5 text-ink-muted">
              {[typeLabel(pub), pub.organization, pub.location].filter(Boolean).join(" · ")}
            </span>
            {(expiry || rate || pub.isOwn) && (
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm leading-5">
                {expiry && <span className={expiry.soon ? "font-medium text-warning" : "text-ink-subtle"}>{expiry.label}</span>}
                {rate && <span className="text-ink-muted">{rate}</span>}
                {pub.isOwn && <span className="text-ink-subtle">Ma publication</span>}
              </span>
            )}
          </span>
        </button>
      </li>
    );
  }

  function renderList() {
    if (visible.length > 0) {
      return <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{visible.map(renderCard)}</ul>;
    }
    if (filtering) {
      return (
        <EmptyState
          icon={SearchX}
          title="Aucun résultat pour ces filtres"
          description="Aucune publication ne correspond à la recherche ou aux filtres choisis."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Effacer les filtres
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={tab === "opportunites" ? Briefcase : UserRoundSearch}
        title={EMPTY[tab].title}
        description={EMPTY[tab].description}
        action={<PublishChooser only={TAB_KINDS[tab]} />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} ariaLabel="Sortes de publications" />

      <div className="flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "opportunites" ? "Rechercher un métier, une entreprise, une ville…" : "Rechercher un métier, un domaine, une ville…"}
          aria-label="Rechercher une publication"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-2">
            {TAB_CHIPS[tab].map((chip) => (
              <FilterChip key={chip} pressed={chips.includes(chip)} onClick={() => toggleChip(chip)}>
                {CHIP_LABEL[chip]}
              </FilterChip>
            ))}
          </div>
          <FilterChip pressed={mine} onClick={() => setMine((m) => !m)}>
            Mes publications
          </FilterChip>
        </div>
        {(canManage || (tab === "opportunites" && recapItems.length > 0)) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {canManage ? (
              <div role="group" aria-label="Filtrer par état" className="flex flex-wrap gap-2">
                {STATE_FILTERS.map((f) => (
                  <FilterChip key={f.key} pressed={stateFilter === f.key} onClick={() => setStateFilter(f.key)}>
                    {f.label}
                  </FilterChip>
                ))}
              </div>
            ) : (
              <span />
            )}
            {tab === "opportunites" && recapItems.length > 0 && (
              <Button variant="secondary" onClick={() => void copyRecap()}>
                <Copy aria-hidden="true" className="size-4" />
                Copier pour WhatsApp
              </Button>
            )}
          </div>
        )}
      </div>

      <ListDetailLayout
        list={renderList()}
        detail={
          selected ? (
            <PublicationDetail
              key={selected.id}
              publication={selected}
              canManage={canManage}
              nowMs={nowMs}
              onChanged={() => router.refresh()}
              onDeleted={() => {
                setSelectedId(null);
                router.refresh();
              }}
            />
          ) : null
        }
        detailTitle={selected?.title ?? ""}
        onClose={() => setSelectedId(null)}
        asideLabel="Détail de la publication"
        placeholder={{ title: "Aucune publication sélectionnée", description: "Choisissez une publication dans la liste pour la consulter." }}
      />

      <Modal open={fallbackText !== null} onClose={() => setFallbackText(null)} title="Copier le message">
        <p className="mb-3 text-sm text-ink-muted">
          La copie automatique n&apos;a pas fonctionné. Sélectionnez le texte ci-dessous et copiez-le manuellement.
        </p>
        <textarea
          readOnly
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={fallbackText ?? ""}
          rows={12}
          aria-label="Message à copier"
          className="w-full rounded-control border border-control-line bg-surface p-2 font-mono text-xs text-ink focus:border-brand focus:outline-none"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setFallbackText(null)}>
            Fermer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
