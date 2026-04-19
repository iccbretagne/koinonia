"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  hasPlanningAccess?: boolean;
  hasMembersAccess?: boolean;
  hasMyPlanning?: boolean;
  onMenuOpen?: () => void;
}

// Sections that have a dedicated nav item — "Menu" is active for everything else
const KNOWN_PREFIXES = ["/dashboard", "/planning", "/events"];

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function IconPerson({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function BottomNav({
  hasPlanningAccess = true,
  hasMyPlanning = false,
  onMenuOpen,
}: BottomNavProps) {
  const pathname = usePathname();
  const isOnKnownRoute = KNOWN_PREFIXES.some((p) => pathname.startsWith(p));

  const links = [
    hasPlanningAccess && {
      href: "/dashboard",
      label: "Planning",
      matchPrefix: "/dashboard",
      icon: <IconGrid className="w-5 h-5" />,
    },
    hasMyPlanning && {
      href: "/planning",
      label: "Mon planning",
      matchPrefix: "/planning",
      icon: <IconPerson className="w-5 h-5" />,
    },
    {
      href: "/events",
      label: "Événements",
      matchPrefix: "/events",
      icon: <IconCalendar className="w-5 h-5" />,
    },
  ].filter(Boolean) as { href: string; label: string; matchPrefix: string; icon: React.ReactNode }[];

  return (
    <nav
      data-tour="bottom-nav"
      className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 md:hidden print:hidden"
    >
      <div className="flex justify-around items-center h-14">
        {links.map((item) => {
          const isActive = pathname.startsWith(item.matchPrefix);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? "text-icc-violet" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {item.icon}
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Menu — opens sidebar, highlighted when on any section not in the links above */}
        <button
          type="button"
          onClick={onMenuOpen}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            !isOnKnownRoute ? "text-icc-violet" : "text-gray-400 hover:text-gray-600"
          }`}
          aria-label="Ouvrir le menu"
        >
          <IconMenu className="w-5 h-5" />
          <span className="text-[11px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
