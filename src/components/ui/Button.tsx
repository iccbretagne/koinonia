"use client";

import { ButtonHTMLAttributes } from "react";
import { buttonClasses, type Size, type Variant } from "./button-classes";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
}

/**
 * Bouton d'action (docs/design-system/components/Button.md). Au plus un `primary` par écran.
 * Pendant un envoi : `disabled` et libellé à l'action en cours (« Enregistrement… ») — pas de
 * prop `loading`. Une icône Lucide 16px peut précéder le libellé.
 */
export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={`${buttonClasses(variant, size)} ${className}`} {...props}>
      {children}
    </button>
  );
}
