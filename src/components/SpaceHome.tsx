import Link from "next/link";
import type { SpaceCard } from "@/lib/media-space";

/**
 * Accueil à cartes générique pour un espace à droits distincts (Communication & Production,
 * Audio — spec 049) : une carte par activité accessible, grille responsive (1 colonne mobile,
 * 2 colonnes desktop). L'appelant décide de la redirection directe si une seule carte.
 */
export default function SpaceHome({
  title,
  headerAction,
  cards,
}: {
  title: string;
  headerAction?: React.ReactNode;
  cards: SpaceCard[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {headerAction}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="border-2 border-gray-200 rounded-lg p-5 hover:border-icc-violet transition-colors flex flex-col gap-2"
          >
            <span className="text-lg font-semibold text-gray-900">{card.title}</span>
            {card.team && <span className="text-sm text-gray-500">{card.team}</span>}
            {card.stats && card.stats.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {card.stats.map((stat) => (
                  <span
                    key={stat}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-icc-jaune/30 text-gray-800"
                  >
                    {stat}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
