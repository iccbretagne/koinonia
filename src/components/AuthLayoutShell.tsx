"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import Breadcrumb from "@/components/Breadcrumb";
import GuidedTour from "@/components/GuidedTour";

type RoleKey = "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER";

interface AuthLayoutShellProps {
  departments: { id: string; name: string; ministryName?: string }[];
  adminLinks: { href: string; label: string }[];
  serviceLinks: { href: string; label: string }[];
  hasDiscipleship: boolean;
  hasEventsAccess: boolean;
  hasPlanningAccess: boolean;
  hasAdminAccess: boolean;
  hasReports?: boolean;
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

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function AuthLayoutShell({
  departments,
  adminLinks,
  serviceLinks,
  hasDiscipleship,
  hasEventsAccess,
  hasPlanningAccess,
  hasAdminAccess,
  hasReports,
  userRole,
  header,
  children,
  footer,
}: AuthLayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-icc-violet border-b-2 border-icc-violet-dark">
        <div className="flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-1.5 -ml-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {sidebarOpen ? (
              <IconClose className="w-6 h-6" />
            ) : (
              <IconMenu className="w-6 h-6" />
            )}
          </button>
          {header}
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-col md:flex-row mx-auto max-w-7xl">
        {/* Overlay (mobile only) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out
            md:relative md:translate-x-0 md:transform-none
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="h-full pt-[57px] md:pt-0">
            <Sidebar
              departments={departments}
              adminLinks={adminLinks}
              serviceLinks={serviceLinks}
              hasDiscipleship={hasDiscipleship}
              hasEventsAccess={hasEventsAccess}
              hasPlanningAccess={hasPlanningAccess}
              hasReports={hasReports}
              onClose={closeSidebar}
            />
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 pb-20 md:p-6 md:pb-6">
          <Breadcrumb departments={departments} />
          {children}
        </main>
      </div>

      {footer}

      {/* Bottom navigation (mobile only) */}
      <BottomNav hasAdminAccess={hasAdminAccess} />

      {/* Interactive guided tour */}
      <GuidedTour userRole={userRole} />
    </div>
  );
}
