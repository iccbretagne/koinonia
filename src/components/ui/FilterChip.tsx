import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

/** Apparence d'une pastille de filtre, active ou non (réutilisable hors du composant). */
export function filterChipClasses(pressed: boolean): string {
  return `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-120
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          pressed ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
        }`;
}

interface FilterChipButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  /** Filtre actif. */
  readonly pressed: boolean;
  readonly children: ReactNode;
  readonly href?: undefined;
}

interface FilterChipLinkProps {
  /** Filtre actif : la pastille porte alors `aria-current="page"`. */
  readonly pressed: boolean;
  readonly children: ReactNode;
  /** Filtre porté par l'URL (`?statut=…`) : la pastille est un lien `next/link`. */
  readonly href: string;
  readonly className?: string;
  /** Défilement remis en haut à la navigation (défaut `next/link`) ; `false` pour garder la position. */
  readonly scroll?: boolean;
}

type FilterChipProps = FilterChipButtonProps | FilterChipLinkProps;

/**
 * Pastille de filtre (spec 063, extraite spec 064) de 44 px de haut. Deux formes :
 * - bouton bascule `aria-pressed` (filtre tenu dans l'état de la page) ;
 * - lien (`href`) quand le filtre vit dans l'URL, l'actif portant `aria-current="page"`.
 * À regrouper dans un conteneur `role="group"` (boutons) ou une `<nav>` (liens) portant un `aria-label`.
 */
export default function FilterChip(props: Readonly<FilterChipProps>) {
  if (props.href !== undefined) {
    const { pressed, children, href, className = "", scroll } = props;
    return (
      <Link
        href={href}
        scroll={scroll}
        aria-current={pressed ? "page" : undefined}
        className={`${filterChipClasses(pressed)} ${className}`}
      >
        {children}
      </Link>
    );
  }
  const { pressed, children, className = "", type = "button", href: _href, ...rest } = props;
  void _href;
  return (
    <button type={type} aria-pressed={pressed} className={`${filterChipClasses(pressed)} ${className}`} {...rest}>
      {children}
    </button>
  );
}
