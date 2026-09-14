"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fil d'Ariane de retour à l'accueil d'un espace à cartes (Communication & Production, Audio —
 * spec 049) — masqué sur l'accueil lui-même.
 */
export default function SpaceBreadcrumb({ homeHref, label }: { readonly homeHref: string; readonly label: string }) {
  const pathname = usePathname();
  if (pathname === homeHref) return null;

  return (
    <Link href={homeHref} className="inline-block text-sm text-icc-violet hover:underline mb-4">
      ← {label}
    </Link>
  );
}
