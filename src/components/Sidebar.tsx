"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

interface SidebarProps {
  departments: { id: string; name: string; ministryName?: string }[];
  configLinks: { href: string; label: string }[];
  serviceLinks: { href: string; label: string }[];
  hasDiscipleship?: boolean;
  hasEventsAccess?: boolean;
  hasEventsManage?: boolean;
  hasPlanningAccess?: boolean;
  hasMembersAccess?: boolean;
  hasReports?: boolean;
  onClose?: () => void;
}

/* ── Icones SVG ─────────────────────────────────────────── */

function IconPlanning({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
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

function IconMembers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function IconMegaphone({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  );
}

function IconDiscipleship({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function IconConfig({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/* ── Section header style partagé ───────────────────────── */

const sectionHeaderBase =
  "flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold tracking-wide transition-colors";
const sectionHeaderIdle = "text-gray-600 hover:bg-gray-50";
const sectionHeaderActive = "bg-icc-violet-light text-icc-violet";

function AccordionSection({
  title,
  icon,
  open,
  onToggle,
  isActive = false,
  dataTour,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  isActive?: boolean;
  dataTour?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-tour={dataTour}>
      <button
        onClick={onToggle}
        className={`${sectionHeaderBase} ${isActive ? sectionHeaderActive : sectionHeaderIdle} rounded-md`}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="pb-1 pt-1">{children}</div>
      </div>
    </div>
  );
}

/* ── Départements groupés par ministère (accordéon) ───── */

function MinistryGroupedDepartments({
  departments,
  activeDept,
  onClose,
}: {
  departments: { id: string; name: string; ministryName?: string }[];
  activeDept: string | null;
  onClose?: () => void;
}) {
  // Group departments by ministry
  const grouped: { ministry: string; depts: typeof departments }[] = [];
  const seen = new Map<string, number>();
  for (const dept of departments) {
    const key = dept.ministryName || "";
    const idx = seen.get(key);
    if (idx !== undefined) {
      grouped[idx].depts.push(dept);
    } else {
      seen.set(key, grouped.length);
      grouped.push({ ministry: key, depts: [dept] });
    }
  }

  // Find which ministry contains the active department
  const activeMinistry = activeDept
    ? departments.find((d) => d.id === activeDept)?.ministryName || null
    : null;

  const [openMinistry, setOpenMinistry] = useState<string | null>(
    activeMinistry ?? grouped[0]?.ministry ?? null
  );

  // Open the ministry containing the active department when it changes
  useEffect(() => {
    if (activeMinistry !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenMinistry(activeMinistry);
    }
  }, [activeMinistry]);

  return (
    <nav className="pl-4 space-y-1">
      {grouped.map(({ ministry, depts }) => {
        const isOpen = openMinistry === ministry;
        const hasActiveDept = depts.some((d) => d.id === activeDept);
        return (
          <div key={ministry}>
            <Link
              href={`/dashboard?dept=${depts[0].id}`}
              onClick={() => {
                if (isOpen && !hasActiveDept) {
                  // Already open, just navigate
                } else if (!isOpen) {
                  setOpenMinistry(ministry);
                }
                onClose?.();
              }}
              className={`flex items-center gap-1.5 w-full px-2 py-2.5 md:py-1.5 rounded-md text-sm font-medium transition-colors ${
                hasActiveDept
                  ? "text-icc-violet"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="truncate">{ministry}</span>
            </Link>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="mt-0.5 space-y-0.5 pl-5">
                {depts.map((dept) => (
                  <Link
                    key={dept.id}
                    href={`/dashboard?dept=${dept.id}`}
                    onClick={onClose}
                    className={`block w-full text-left px-2 py-2.5 md:py-1.5 rounded-md text-sm transition-colors ${
                      activeDept === dept.id
                        ? "bg-icc-violet-light text-icc-violet font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {dept.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/* ── Lien interne dans un accordion ──────────────────────── */

function NavLink({
  href,
  active,
  onClose,
  children,
}: {
  href: string;
  active: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`block w-full text-left px-3 py-2.5 md:py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-icc-violet-light text-icc-violet font-medium"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── Sidebar ────────────────────────────────────────────── */

export default function Sidebar({
  departments,
  configLinks,
  serviceLinks,
  hasDiscipleship = false,
  hasEventsAccess = true,
  hasEventsManage = false,
  hasPlanningAccess = true,
  hasMembersAccess = false,
  hasReports = false,
  onClose,
}: SidebarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeDept = searchParams.get("dept");

  // ── Active detection ────────────────────────────────────
  const isDashboardActive = pathname === "/dashboard";
  const isEventsActive =
    pathname.startsWith("/events") ||
    pathname.startsWith("/admin/events") ||
    pathname.startsWith("/admin/reports");
  const isMembersActive = pathname.startsWith("/admin/members");
  const isServiceActive =
    pathname.startsWith("/announcements") ||
    pathname.startsWith("/secretariat") ||
    pathname.startsWith("/media") ||
    pathname.startsWith("/communication");
  const isDiscipleshipActive = pathname.startsWith("/admin/discipleship");
  const isConfigActive =
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/events") &&
    !pathname.startsWith("/admin/reports") &&
    !pathname.startsWith("/admin/members") &&
    !pathname.startsWith("/admin/discipleship");

  function activeSection() {
    if (isEventsActive) return "events";
    if (isMembersActive) return "members";
    if (isServiceActive) return "service";
    if (isDiscipleshipActive) return "discipleship";
    if (isConfigActive) return "config";
    return "planning";
  }

  const [openSection, setOpenSection] = useState<string>(activeSection);

  useEffect(() => {
    setOpenSection(activeSection());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(section: string) {
    setOpenSection((prev) => (prev === section ? "" : section));
  }

  return (
    <aside className="w-64 min-h-0 md:min-h-[calc(100vh-73px)] bg-white border-r border-gray-200 p-4 pb-20 md:pb-4 space-y-1 overflow-y-auto">
      {/* 1. Planning */}
      {hasPlanningAccess && (
        <AccordionSection
          title="Planning"
          icon={<IconPlanning className="w-4 h-4" />}
          open={openSection === "planning"}
          onToggle={() => toggle("planning")}
          isActive={isDashboardActive}
          dataTour="sidebar-planning"
        >
          {departments.length === 0 ? (
            <p className="px-3 text-sm text-gray-400">
              Aucun département assigné.
            </p>
          ) : departments.some((d) => d.ministryName) ? (
            <MinistryGroupedDepartments
              departments={departments}
              activeDept={activeDept}
              onClose={onClose}
            />
          ) : (
            <nav className="space-y-0.5 pl-6">
              {departments.map((dept) => (
                <Link
                  key={dept.id}
                  href={`/dashboard?dept=${dept.id}`}
                  onClick={onClose}
                  className={`block w-full text-left px-3 py-2.5 md:py-1.5 rounded-md text-sm transition-colors ${
                    activeDept === dept.id
                      ? "bg-icc-violet-light text-icc-violet font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {dept.name}
                </Link>
              ))}
            </nav>
          )}
        </AccordionSection>
      )}

      {/* 2. Événements */}
      {hasEventsAccess && (
        <AccordionSection
          title="Événements"
          icon={<IconCalendar className="w-4 h-4" />}
          open={openSection === "events"}
          onToggle={() => toggle("events")}
          isActive={isEventsActive}
          dataTour="sidebar-events"
        >
          <nav className="space-y-0.5 pl-6">
            <NavLink href="/events" active={pathname === "/events"} onClose={onClose}>
              Liste
            </NavLink>
            <NavLink href="/events/calendar" active={pathname === "/events/calendar"} onClose={onClose}>
              Calendrier
            </NavLink>
            {hasEventsManage && (
              <NavLink href="/admin/events" active={pathname.startsWith("/admin/events")} onClose={onClose}>
                Gestion
              </NavLink>
            )}
            {hasReports && (
              <span data-tour="sidebar-reports">
                <NavLink href="/admin/reports" active={pathname.startsWith("/admin/reports")} onClose={onClose}>
                  Comptes rendus
                </NavLink>
              </span>
            )}
          </nav>
        </AccordionSection>
      )}

      {/* 3. Membres */}
      {hasMembersAccess && (
        <Link
          href="/admin/members"
          onClick={onClose}
          data-tour="sidebar-members"
          className={`${sectionHeaderBase} ${isMembersActive ? sectionHeaderActive : sectionHeaderIdle} rounded-md`}
        >
          <IconMembers className="w-4 h-4 shrink-0" />
          <span className="flex-1">Membres</span>
        </Link>
      )}

      {/* 4. Annonces */}
      {serviceLinks.length > 0 && (
        <AccordionSection
          title="Annonces"
          icon={<IconMegaphone className="w-4 h-4" />}
          open={openSection === "service"}
          onToggle={() => toggle("service")}
          isActive={isServiceActive}
          dataTour="sidebar-service"
        >
          <nav className="space-y-0.5 pl-6">
            {serviceLinks.map((link) => (
              <NavLink key={link.href} href={link.href} active={pathname.startsWith(link.href)} onClose={onClose}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </AccordionSection>
      )}

      {/* 5. Discipolat */}
      {hasDiscipleship && (
        <AccordionSection
          title="Discipolat"
          icon={<IconDiscipleship className="w-4 h-4" />}
          open={openSection === "discipleship"}
          onToggle={() => toggle("discipleship")}
          isActive={isDiscipleshipActive}
          dataTour="sidebar-discipleship"
        >
          <nav className="space-y-0.5 pl-6">
            <NavLink href="/admin/discipleship" active={pathname === "/admin/discipleship"} onClose={onClose}>
              Tableau de bord
            </NavLink>
          </nav>
        </AccordionSection>
      )}

      {/* 6. Configuration */}
      {configLinks.length > 0 && (
        <AccordionSection
          title="Configuration"
          icon={<IconConfig className="w-4 h-4" />}
          open={openSection === "config"}
          onToggle={() => toggle("config")}
          isActive={isConfigActive}
          dataTour="sidebar-config"
        >
          <nav className="space-y-0.5 pl-6">
            {configLinks.map((link) => (
              <NavLink key={link.href} href={link.href} active={pathname === link.href} onClose={onClose}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </AccordionSection>
      )}
    </aside>
  );
}
