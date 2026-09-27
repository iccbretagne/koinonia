import Link from "next/link";
import {
  AudioLines,
  Camera,
  Headphones,
  Image as ImageIcon,
  LayoutGrid,
  Megaphone,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import StatusChip, { type StatusTone } from "@/components/ui/StatusChip";
import type { SpaceCard } from "@/lib/media-space";

/** Icône d'une carte, d'après sa destination (les cartes sont décrites par `@/lib/media-space`). */
const CARD_ICONS: { prefix: string; icon: LucideIcon }[] = [
  { prefix: "/media/events", icon: Camera },
  { prefix: "/media/projects", icon: ImageIcon },
  { prefix: "/media/requests", icon: ImageIcon },
  { prefix: "/communication", icon: Megaphone },
  { prefix: "/audio/ecouter", icon: Headphones },
  { prefix: "/audio/production", icon: AudioLines },
  { prefix: "/audio/parametres", icon: SlidersHorizontal },
];

export function cardIcon(href: string): LucideIcon {
  return CARD_ICONS.find((c) => href === c.prefix || href.startsWith(`${c.prefix}/`))?.icon ?? LayoutGrid;
}

/**
 * Tonalité d'un compteur : `warning` pour ce qui attend (« 3 en attente »), neutre sinon ou à zéro.
 */
export function statTone(stat: string): StatusTone {
  const count = Number.parseInt(stat, 10);
  if (count === 0) return "neutral";
  if (/attente|à traiter|a traiter/i.test(stat)) return "warning";
  return "neutral";
}

/**
 * Accueil à cartes générique pour un espace à droits distincts (Communication & Production,
 * Audio — spec 049), en `SpaceCard` (docs/design-system/components/SpaceCard.md) : une carte par
 * activité accessible ; une colonne sous 640px, deux au-delà, trois à partir de 1200px.
 * L'appelant décide de la redirection directe si une seule carte.
 */
export default function SpaceHome({
  title,
  headerAction,
  cards,
}: {
  readonly title: string;
  readonly headerAction?: React.ReactNode;
  readonly cards: SpaceCard[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} actions={headerAction} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1200px]:grid-cols-3">
        {cards.map((card) => {
          const Icon = cardIcon(card.href);
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-colors duration-120
                hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="grid size-11 place-items-center rounded-control bg-brand-soft text-brand-text">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-[17px] font-semibold leading-6 text-ink">{card.title}</span>
                {card.team && <span className="text-sm text-ink-muted">{card.team}</span>}
              </span>
              {card.stats && card.stats.length > 0 && (
                <span className="flex flex-wrap gap-2">
                  {card.stats.map((stat) => (
                    <StatusChip key={stat} tone={statTone(stat)}>
                      {stat}
                    </StatusChip>
                  ))}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
