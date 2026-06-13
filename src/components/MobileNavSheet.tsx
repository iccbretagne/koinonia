"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type SheetView = "root" | "planning" | "evenements" | "pastoral" | "communaute" | "operations" | "ressources" | "config";

interface MobileNavSheetProps {
  departments: { id: string; name: string; ministryName?: string }[];
  configLinks: { href: string; label: string }[];
  requestLinks: { href: string; label: string }[];
  mediaLinks: { href: string; label: string }[];
  agendaLinks?: { href: string; label: string }[];
  integrationLinks?: { href: string; label: string }[];
  mrbsUrl?: string | null;
  mrbsAdminLink?: string | null;
  famillesUrl?: string | null;
  hasDiscipleship?: boolean;
  hasEventsAccess?: boolean;
  hasEventsManage?: boolean;
  hasPlanningAccess?: boolean;
  hasMembersAccess?: boolean;
  hasReports?: boolean;
  hasMyPlanning?: boolean;
  hasAccounting?: boolean;
  hasJobs?: boolean;
  hasJobsManage?: boolean;
  isPastoral?: boolean;
  open: boolean;
  onClose: () => void;
}

/* ── Icones ───────────────────────────────────────────────── */

function IconBack({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconPlanning({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function IconMyPlanning({ className }: { className?: string }) {
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

function IconResources({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

/* ── Composants helper ────────────────────────────────────── */

function RootRow({
  label,
  icon,
  isActive,
  hasChildren,
  href,
  onClose,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  hasChildren?: boolean;
  href?: string;
  onClose?: () => void;
  onClick?: () => void;
}) {
  const base = `flex items-center gap-4 w-full px-5 py-4 text-left transition-colors border-b border-gray-50 last:border-0 ${
    isActive
      ? "text-icc-violet bg-violet-50"
      : "text-gray-800 hover:bg-gray-50 active:bg-gray-100"
  }`;

  if (href) {
    return (
      <Link href={href} onClick={onClose} className={base}>
        <span className={`w-6 flex justify-center ${isActive ? "text-icc-violet" : "text-gray-400"}`}>
          {icon}
        </span>
        <span className="flex-1 font-medium text-[15px]">{label}</span>
        {isActive && <span className="w-2 h-2 rounded-full bg-icc-violet shrink-0" />}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={base}>
      <span className={`w-6 flex justify-center ${isActive ? "text-icc-violet" : "text-gray-400"}`}>
        {icon}
      </span>
      <span className="flex-1 font-medium text-[15px]">{label}</span>
      {hasChildren && <IconChevron className="w-5 h-5 text-gray-300 shrink-0" />}
    </button>
  );
}

function SubRow({
  href,
  label,
  isActive,
  onClose,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`flex items-center justify-between px-6 py-4 text-[15px] border-b border-gray-50 last:border-0 transition-colors ${
        isActive
          ? "text-icc-violet font-semibold bg-violet-50"
          : "text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      }`}
    >
      <span>{label}</span>
      {isActive && <span className="w-2 h-2 rounded-full bg-icc-violet shrink-0" />}
    </Link>
  );
}

function ExternalSubRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-6 py-4 text-[15px] border-b border-gray-50 last:border-0 text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <span>{label}</span>
    </a>
  );
}

function SubDivider() {
  return <div className="mx-6 border-t border-gray-100" />;
}

function SheetSubHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
      <button
        type="button"
        onClick={onBack}
        className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500 transition-colors"
        aria-label="Retour"
      >
        <IconBack className="w-5 h-5" />
      </button>
      <span className="font-semibold text-gray-900 text-base">{title}</span>
    </div>
  );
}

/* ── MobileNavSheet ───────────────────────────────────────── */

export default function MobileNavSheet({
  departments,
  configLinks,
  requestLinks,
  mediaLinks,
  agendaLinks = [],
  integrationLinks = [],
  mrbsUrl = null,
  mrbsAdminLink = null,
  famillesUrl = null,
  hasDiscipleship = false,
  hasEventsAccess = true,
  hasEventsManage = false,
  hasPlanningAccess = true,
  hasMembersAccess = false,
  hasReports = false,
  hasMyPlanning = false,
  hasAccounting = false,
  hasJobs = false,
  hasJobsManage = false,
  isPastoral = false,
  open,
  onClose,
}: MobileNavSheetProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDept = searchParams.get("dept");
  const [view, setView] = useState<SheetView>("root");

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setView("root"), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const grouped: { ministry: string; depts: typeof departments }[] = [];
  const seen = new Map<string, number>();
  for (const dept of departments) {
    const key = dept.ministryName ?? "";
    const idx = seen.get(key);
    if (idx !== undefined) {
      grouped[idx].depts.push(dept);
    } else {
      seen.set(key, grouped.length);
      grouped.push({ ministry: key, depts: [dept] });
    }
  }
  const hasMinistriesGrouped = departments.some((d) => d.ministryName);

  /* ── Active states ── */
  const isEventsActive =
    pathname.startsWith("/events") ||
    pathname.startsWith("/admin/events") ||
    pathname.startsWith("/admin/reports") ||
    pathname.startsWith("/admin/welcome-duty");
  const isAgendaActive = pathname.startsWith("/agenda") && pathname !== "/agenda/request";
  const isRequestsActive =
    pathname.startsWith("/requests") ||
    pathname.startsWith("/secretariat") ||
    pathname === "/agenda/request";
  const isMediaActive =
    pathname.startsWith("/media") || pathname.startsWith("/communication");
  const isIntegrationActive = pathname.startsWith("/integration");
  const isAccountingActive = pathname.startsWith("/accounting");
  const isJobsActive = pathname.startsWith("/jobs") || pathname.startsWith("/admin/jobs");
  const isMrbsActive = pathname.startsWith("/admin/mrbs");
  const isConfigActive =
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/events") &&
    !pathname.startsWith("/admin/reports") &&
    !pathname.startsWith("/admin/members") &&
    !pathname.startsWith("/admin/discipleship") &&
    !pathname.startsWith("/admin/welcome-duty") &&
    !pathname.startsWith("/admin/jobs");

  const isCommunauteActive =
    pathname.startsWith("/admin/members") ||
    pathname.startsWith("/admin/discipleship") ||
    isIntegrationActive;
  const isEvenementsActive = isEventsActive;
  const isGestionPastoraleActive = isAgendaActive;
  const isOperationsActive = isRequestsActive || isMediaActive;
  const isRessourcesActive = isAccountingActive || isJobsActive || isMrbsActive;

  const hasCommunaute =
    hasMembersAccess || hasDiscipleship || integrationLinks.length > 0 || !!famillesUrl;
  const hasOperations = requestLinks.length > 0 || mediaLinks.length > 0;
  const hasRessources = !!(mrbsUrl || mrbsAdminLink || hasAccounting || hasJobs);

  /* ── Views ── */

  function renderPastoralRoot() {
    return (
      <div className="py-1">
        <RootRow
          label="Accueil pastoral"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
          href="/pastoral"
          isActive={pathname === "/pastoral"}
          onClose={onClose}
        />
        <RootRow
          label="Mes membres"
          icon={<IconMembers className="w-5 h-5" />}
          href="/pastoral/members"
          isActive={pathname.startsWith("/pastoral/members")}
          onClose={onClose}
        />
        {agendaLinks.length > 0 && (
          <RootRow
            label="Gestion pastorale"
            icon={<IconDiscipleship className="w-5 h-5" />}
            hasChildren
            isActive={isGestionPastoraleActive}
            onClick={() => setView("pastoral")}
          />
        )}
        {hasDiscipleship && (
          <RootRow
            label="Discipolat"
            icon={<IconDiscipleship className="w-5 h-5" />}
            href="/admin/discipleship"
            isActive={pathname.startsWith("/admin/discipleship")}
            onClose={onClose}
          />
        )}
        {hasEventsAccess && (
          <RootRow
            label="Événements"
            icon={<IconCalendar className="w-5 h-5" />}
            hasChildren
            isActive={isEventsActive}
            onClick={() => setView("evenements")}
          />
        )}
        {hasJobs && (
          <RootRow
            label="Emploi"
            icon={<IconResources className="w-5 h-5" />}
            hasChildren
            isActive={isJobsActive}
            onClick={() => setView("ressources")}
          />
        )}
        {configLinks.length > 0 && (
          <RootRow
            label="Configuration"
            icon={<IconConfig className="w-5 h-5" />}
            hasChildren
            isActive={isConfigActive}
            onClick={() => setView("config")}
          />
        )}
      </div>
    );
  }

  function renderRoot() {
    if (isPastoral) return renderPastoralRoot();
    return (
      <div className="py-1">
        {hasMyPlanning && (
          <RootRow
            label="Mon planning"
            icon={<IconMyPlanning className="w-5 h-5" />}
            href="/planning"
            isActive={pathname === "/planning"}
            onClose={onClose}
          />
        )}
        {hasPlanningAccess && (
          <RootRow
            label="Planning"
            icon={<IconPlanning className="w-5 h-5" />}
            hasChildren
            isActive={pathname === "/dashboard"}
            onClick={() => setView("planning")}
          />
        )}
        {hasCommunaute && (
          <RootRow
            label="Communauté"
            icon={<IconDiscipleship className="w-5 h-5" />}
            hasChildren
            isActive={isCommunauteActive}
            onClick={() => setView("communaute")}
          />
        )}
        {hasEventsAccess && (
          <RootRow
            label="Événements"
            icon={<IconCalendar className="w-5 h-5" />}
            hasChildren
            isActive={isEvenementsActive}
            onClick={() => setView("evenements")}
          />
        )}
        {agendaLinks.length > 0 && (
          <RootRow
            label="Gestion pastorale"
            icon={<IconDiscipleship className="w-5 h-5" />}
            hasChildren
            isActive={isGestionPastoraleActive}
            onClick={() => setView("pastoral")}
          />
        )}
        {hasOperations && (
          <RootRow
            label="Opérations"
            icon={<IconMegaphone className="w-5 h-5" />}
            hasChildren
            isActive={isOperationsActive}
            onClick={() => setView("operations")}
          />
        )}
        {hasRessources && (
          <RootRow
            label="Ressources"
            icon={<IconResources className="w-5 h-5" />}
            hasChildren
            isActive={isRessourcesActive}
            onClick={() => setView("ressources")}
          />
        )}
        {configLinks.length > 0 && (
          <RootRow
            label="Configuration"
            icon={<IconConfig className="w-5 h-5" />}
            hasChildren
            isActive={isConfigActive}
            onClick={() => setView("config")}
          />
        )}
      </div>
    );
  }

  function renderPlanning() {
    return (
      <>
        <SheetSubHeader title="Planning" onBack={() => setView("root")} />
        <div>
          {hasMinistriesGrouped ? (
            grouped.map(({ ministry, depts }) => (
              <div key={ministry}>
                {ministry && (
                  <div className="px-6 pt-4 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    {ministry}
                  </div>
                )}
                {depts.map((dept) => (
                  <SubRow
                    key={dept.id}
                    href={`/dashboard?dept=${dept.id}`}
                    label={dept.name}
                    isActive={activeDept === dept.id}
                    onClose={onClose}
                  />
                ))}
              </div>
            ))
          ) : (
            departments.map((dept) => (
              <SubRow
                key={dept.id}
                href={`/dashboard?dept=${dept.id}`}
                label={dept.name}
                isActive={activeDept === dept.id}
                onClose={onClose}
              />
            ))
          )}
        </div>
      </>
    );
  }

  function renderCommunaute() {
    return (
      <>
        <SheetSubHeader title="Communauté" onBack={() => setView("root")} />
        <div>
          {hasMembersAccess && (
            <SubRow href="/admin/members" label="STAR" isActive={pathname.startsWith("/admin/members")} onClose={onClose} />
          )}
          {hasDiscipleship && (
            <SubRow href="/admin/discipleship" label="Discipolat" isActive={pathname.startsWith("/admin/discipleship")} onClose={onClose} />
          )}
          {integrationLinks.length > 0 && (
            <>
              {(hasMembersAccess || hasDiscipleship) && <SubDivider />}
              {integrationLinks.map((link) => (
                <SubRow key={link.href} href={link.href} label={link.label} isActive={pathname.startsWith(link.href)} onClose={onClose} />
              ))}
            </>
          )}
          {famillesUrl && (
            <>
              {(hasMembersAccess || hasDiscipleship || integrationLinks.length > 0) && <SubDivider />}
              <ExternalSubRow href={famillesUrl} label="Familles ↗" />
            </>
          )}
        </div>
      </>
    );
  }

  function renderEvenements() {
    return (
      <>
        <SheetSubHeader title="Événements" onBack={() => setView("root")} />
        <div>
          <SubRow href="/events" label="Liste" isActive={pathname === "/events"} onClose={onClose} />
          <SubRow href="/events/calendar" label="Calendrier" isActive={pathname === "/events/calendar"} onClose={onClose} />
          {hasEventsManage && (
            <SubRow href="/admin/events" label="Gestion" isActive={pathname.startsWith("/admin/events") && !pathname.startsWith("/admin/welcome-duty")} onClose={onClose} />
          )}
          {hasEventsManage && (
            <SubRow href="/admin/welcome-duty" label="Service d'accueil" isActive={pathname.startsWith("/admin/welcome-duty")} onClose={onClose} />
          )}
          {hasReports && (
            <SubRow href="/admin/reports" label="Comptes rendus" isActive={pathname.startsWith("/admin/reports")} onClose={onClose} />
          )}
        </div>
      </>
    );
  }

  function renderGestionPastorale() {
    return (
      <>
        <SheetSubHeader title="Gestion pastorale" onBack={() => setView("root")} />
        <div>
          {agendaLinks.map((link) => {
            const hasChildLink = agendaLinks.some(l => l.href !== link.href && l.href.startsWith(link.href + "/"));
            return (
              <SubRow key={link.href} href={link.href} label={link.label}
                isActive={pathname === link.href || (!hasChildLink && pathname.startsWith(link.href + "/"))}
                onClose={onClose} />
            );
          })}
        </div>
      </>
    );
  }

  function renderOperations() {
    return (
      <>
        <SheetSubHeader title="Opérations" onBack={() => setView("root")} />
        <div>
          {requestLinks.map((link) => (
            <SubRow key={link.href} href={link.href} label={link.label} isActive={pathname.startsWith(link.href)} onClose={onClose} />
          ))}
          {mediaLinks.length > 0 && requestLinks.length > 0 && <SubDivider />}
          {mediaLinks.map((link) => (
            <SubRow key={link.href} href={link.href} label={link.label} isActive={pathname.startsWith(link.href)} onClose={onClose} />
          ))}
        </div>
      </>
    );
  }

  function renderRessources() {
    return (
      <>
        <SheetSubHeader title="Ressources" onBack={() => setView("root")} />
        <div>
          {mrbsUrl && <ExternalSubRow href={mrbsUrl} label="Réserver une salle ↗" />}
          {mrbsAdminLink && (
            <SubRow href={mrbsAdminLink} label="Liaison comptes" isActive={pathname.startsWith(mrbsAdminLink)} onClose={onClose} />
          )}
          {hasAccounting && (
            <>
              {(mrbsUrl || mrbsAdminLink) && <SubDivider />}
              <SubRow href="/accounting/requests" label="Comptabilité" isActive={isAccountingActive} onClose={onClose} />
            </>
          )}
          {hasJobs && (
            <>
              {(mrbsUrl || mrbsAdminLink || hasAccounting) && <SubDivider />}
              <SubRow href="/jobs" label="Offres" isActive={pathname === "/jobs"} onClose={onClose} />
              {hasJobsManage && (
                <SubRow href="/admin/jobs" label="Modération offres" isActive={pathname.startsWith("/admin/jobs")} onClose={onClose} />
              )}
            </>
          )}
        </div>
      </>
    );
  }

  function renderConfig() {
    return (
      <>
        <SheetSubHeader title="Configuration" onBack={() => setView("root")} />
        <div>
          {configLinks.map((link) => (
            <SubRow key={link.href} href={link.href} label={link.label} isActive={pathname === link.href} onClose={onClose} />
          ))}
        </div>
      </>
    );
  }

  function renderContent() {
    switch (view) {
      case "planning":    return renderPlanning();
      case "communaute":  return renderCommunaute();
      case "evenements":  return renderEvenements();
      case "pastoral":    return renderGestionPastorale();
      case "operations":  return renderOperations();
      case "ressources":  return renderRessources();
      case "config":      return renderConfig();
      default:            return renderRoot();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[55] bg-black/50 md:hidden transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[60] md:hidden bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] transform transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        aria-modal="true"
        role="dialog"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 pb-6">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
