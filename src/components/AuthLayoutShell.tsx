"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import MobileNavSheet from "@/components/MobileNavSheet";
import Breadcrumb from "@/components/Breadcrumb";
import GuidedTour from "@/components/GuidedTour";

type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER" | "STAR" | "ACCOUNTANT";

function hexToLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

interface AuthLayoutShellProps {
  departments: { id: string; name: string; ministryName?: string }[];
  configLinks: { href: string; label: string }[];
  requestLinks: { href: string; label: string }[];
  mediaLinks: { href: string; label: string }[];
  agendaLinks?: { href: string; label: string }[];
  integrationLinks?: { href: string; label: string }[];
  mrbsUrl?: string | null;
  mrbsAdminLink?: string | null;
  hasDiscipleship: boolean;
  hasEventsAccess: boolean;
  hasEventsManage: boolean;
  hasPlanningAccess: boolean;
  hasMembersAccess: boolean;
  hasReports: boolean;
  hasMyPlanning?: boolean;
  hasAccounting?: boolean;
  hasJobs?: boolean;
  hasJobsManage?: boolean;
  headerColor?: string;
  userRole: RoleKey;
  header: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}


export default function AuthLayoutShell({
  departments,
  configLinks,
  requestLinks,
  mediaLinks,
  agendaLinks = [],
  integrationLinks = [],
  mrbsUrl = null,
  mrbsAdminLink = null,
  hasDiscipleship,
  hasEventsAccess,
  hasEventsManage,
  hasPlanningAccess,
  hasMembersAccess,
  hasReports,
  hasMyPlanning = false,
  hasAccounting = false,
  hasJobs = false,
  hasJobsManage = false,
  headerColor = "#5E17EB",
  userRole,
  header,
  children,
  footer,
}: AuthLayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isLightHeader = hexToLuminance(headerColor) > 0.4;
  const headerTextColor = isLightHeader ? "#1f2937" : "#ffffff";
  const headerBorderColor = isLightHeader ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)";

  // Close sidebar on route change (mobile)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-2"
        style={{ backgroundColor: headerColor, borderColor: headerBorderColor, color: headerTextColor }}
      >
        <div className="flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1.5 -ml-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label="Ouvrir le menu"
          >
            <IconMenu className="w-6 h-6" />
          </button>
          {header}
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-col md:flex-row mx-auto max-w-7xl">
        {/* Sidebar — desktop uniquement */}
        <div className="hidden md:block print:hidden shrink-0">
          <Sidebar
            departments={departments}
            configLinks={configLinks}
            requestLinks={requestLinks}
            mediaLinks={mediaLinks}
            agendaLinks={agendaLinks}
            integrationLinks={integrationLinks}
            mrbsUrl={mrbsUrl}
            mrbsAdminLink={mrbsAdminLink}
            hasDiscipleship={hasDiscipleship}
            hasEventsAccess={hasEventsAccess}
            hasEventsManage={hasEventsManage}
            hasPlanningAccess={hasPlanningAccess}
            hasMembersAccess={hasMembersAccess}
            hasReports={hasReports}
            hasMyPlanning={hasMyPlanning}
            hasAccounting={hasAccounting}
            hasJobs={hasJobs}
            hasJobsManage={hasJobsManage}
            onClose={closeSidebar}
          />
        </div>

        {/* Bottom sheet — mobile uniquement */}
        <MobileNavSheet
          departments={departments}
          configLinks={configLinks}
          requestLinks={requestLinks}
          mediaLinks={mediaLinks}
          agendaLinks={agendaLinks}
          integrationLinks={integrationLinks}
          mrbsUrl={mrbsUrl}
          mrbsAdminLink={mrbsAdminLink}
          hasDiscipleship={hasDiscipleship}
          hasEventsAccess={hasEventsAccess}
          hasEventsManage={hasEventsManage}
          hasPlanningAccess={hasPlanningAccess}
          hasMembersAccess={hasMembersAccess}
          hasReports={hasReports}
          hasMyPlanning={hasMyPlanning}
          hasAccounting={hasAccounting}
          hasJobs={hasJobs}
          hasJobsManage={hasJobsManage}
          open={sidebarOpen}
          onClose={closeSidebar}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 pb-16 md:p-6 md:pb-6">
          <Breadcrumb departments={departments} />
          {children}
        </main>
      </div>

      {footer}

      {/* Bottom navigation (mobile only) */}
      <BottomNav
        hasMembersAccess={hasMembersAccess}
        hasMyPlanning={hasMyPlanning}
        onMenuOpen={() => setSidebarOpen(true)}
      />

      {/* Interactive guided tour */}
      <GuidedTour userRole={userRole} />
    </div>
  );
}
