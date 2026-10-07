"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./Badge";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Nom accessible, obligatoire : « Fermer », « Notifications, 3 non lues ». */
  readonly "aria-label": string;
  /** Icône Lucide rendue en 20px, trait 1.75. À défaut, `children` (un SVG déjà dimensionné). */
  readonly icon?: LucideIcon;
  readonly children?: ReactNode;
  /** Compteur en pastille en haut à droite ; le nombre est à reprendre dans `aria-label`. */
  readonly badge?: number;
  /** `md` = 44px (défaut, cible tactile), `sm` = 36px (densité desktop uniquement). */
  readonly size?: "sm" | "md";
}

/**
 * Bouton carré à une seule icône (docs/design-system/components/IconButton.md) : fermer, retour,
 * rechercher, notifications, menu « ⋯ ». L'infobulle desktop reprend l'`aria-label` sauf `title`
 * explicite.
 */
export default function IconButton({
  icon: Icon,
  children,
  badge,
  size = "md",
  className = "",
  type = "button",
  title,
  ...props
}: Readonly<IconButtonProps>) {
  return (
    <button
      type={type}
      title={title ?? props["aria-label"]}
      className={`relative inline-grid shrink-0 cursor-pointer place-items-center rounded-control text-ink-muted
        transition-[background-color,color,transform] duration-120 hover:bg-surface-sunken hover:text-ink active:scale-[0.96]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
        disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent motion-reduce:active:scale-100
        ${size === "sm" ? "size-9" : "size-11"} ${className}`}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} /> : children}
      {badge !== undefined && badge > 0 && (
        <span aria-hidden="true" className="absolute right-[5px] top-1.5">
          <Badge count={badge} className="ring-2 ring-surface" />
        </span>
      )}
    </button>
  );
}
