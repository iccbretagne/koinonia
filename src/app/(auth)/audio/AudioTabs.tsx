"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

/** Navigation par onglets de l'espace Audio (spec 021) — un seul lien « Audio », droits distincts par onglet. */
export default function AudioTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b-2 border-gray-100 mb-6 overflow-x-auto" aria-label="Onglets Audio">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-0.5 min-h-[44px] flex items-center ${
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
