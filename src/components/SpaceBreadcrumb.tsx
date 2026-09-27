"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Lien de retour à l'accueil d'un espace à cartes (Communication & Production, Audio —
 * spec 049) — masqué sur l'accueil lui-même.
 */
export default function SpaceBreadcrumb({ homeHref, label }: { readonly homeHref: string; readonly label: string }) {
  const pathname = usePathname();
  if (pathname === homeHref) return null;

  return (
    <Link
      href={homeHref}
      className="-ml-1 mb-4 inline-flex min-h-9 items-center gap-1 rounded-control pl-1 pr-2 font-display text-sm font-semibold text-brand-text
        transition-colors duration-120 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
