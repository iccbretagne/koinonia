"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

/**
 * Barre d'onglets générique pour un espace à droits distincts (Audio, spec 021 ;
 * Communication & Production, spec 043) — un seul lien de navigation, les onglets réellement
 * affichés dépendent des permissions de l'utilisateur, calculées une fois par le layout.
 * `overflow-x-auto` : jusqu'à 5 onglets doivent rester utilisables sur ~400 px.
 */
export default function SpaceTabs({ tabs, ariaLabel }: { tabs: Tab[]; ariaLabel: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 border-b-2 border-gray-100 mb-6 bg-white sticky top-[68px] md:top-[80px] z-40 overflow-x-auto"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-0.5 min-h-[44px] flex items-center shrink-0 ${
              active
                ? "border-icc-violet text-icc-violet"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
