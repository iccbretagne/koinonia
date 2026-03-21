import pkg from "@/../package.json";
import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signOut, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import ChurchSwitcher from "@/components/ChurchSwitcher";
import AuthLayoutShell from "@/components/AuthLayoutShell";
import NotificationBell from "@/components/NotificationBell";

// Liens de la section Configuration (paramétrage — pas les outils quotidiens)
const configLinksDef = [
  { href: "/admin/users", label: "Utilisateurs", permissions: ["members:manage"] },
  { href: "/admin/access", label: "Accès & rôles", permissions: ["departments:manage"] },
  { href: "/admin/ministries", label: "Ministères", permissions: ["departments:manage"] },
  { href: "/admin/departments", label: "Départements", permissions: ["departments:manage"] },
  { href: "/admin/departments/functions", label: "Fonctions dép.", permissions: ["events:manage"] },
  { href: "/admin/churches", label: "Églises", permissions: ["church:manage"] },
  { href: "/admin/audit-logs", label: "Historique", permissions: ["church:manage"] },
];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const churchRoles = session.user.churchRoles;

  if (!session.user.isSuperAdmin && churchRoles.length === 0) {
    redirect("/no-access");
  }

  const currentChurchId = await getCurrentChurchId(session);
  const currentChurch = churchRoles.find((r) => r.churchId === currentChurchId);
  const churchName = currentChurch?.church?.name || "Église";

  const churches = Array.from(
    new Map(churchRoles.map((r) => [r.churchId, { id: r.churchId, name: r.church.name }])).values()
  );

  // Get departments the user has access to
  const userDepartmentIds = churchRoles
    .filter((r) => !currentChurchId || r.churchId === currentChurchId)
    .flatMap((r) => r.departments.map((d) => d.department));

  const departments = Array.from(
    new Map(userDepartmentIds.map((d) => [d.id, d])).values()
  );

  // For super admins / admins, show all departments
  const isAdmin = churchRoles.some(
    (r) =>
      r.churchId === currentChurchId &&
      (r.role === "SUPER_ADMIN" || r.role === "ADMIN" || r.role === "SECRETARY")
  );

  let allDepartments = departments;
  if (isAdmin && currentChurchId) {
    const depts = await prisma.department.findMany({
      where: { ministry: { churchId: currentChurchId }, isSystem: false },
      include: { ministry: true },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
    });
    allDepartments = depts.map((d) => ({ id: d.id, name: d.name, ministryName: d.ministry.name }));
  }

  // Compute visible config links
  const userRoles = churchRoles.map((r) => r.role);
  const userPermissions = new Set(userRoles.flatMap((r) => hasPermission(r)));
  const visibleConfigLinks = configLinksDef
    .filter((link) => link.permissions.some((p) => userPermissions.has(p)))
    .map(({ href, label }) => ({ href, label }));

  // Compute service links (annonces & demandes)
  // Dashboards opérationnels restreints aux membres du département concerné + events:manage
  const serviceLinks: { href: string; label: string }[] = [];

  if (userPermissions.has("planning:view")) {
    serviceLinks.push({ href: "/announcements", label: "Mes annonces" });
  }

  if (currentChurchId && userPermissions.has("planning:view")) {
    const isGlobalManager = userPermissions.has("events:manage");

    // One query for all 3 department functions
    const serviceDepts = await prisma.department.findMany({
      where: {
        function: { in: ["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA"] },
        ministry: { churchId: currentChurchId },
      },
      select: { id: true, function: true },
    });

    const userDeptIds = new Set(
      churchRoles
        .filter((r) => r.churchId === currentChurchId)
        .flatMap((r) => r.departments.map((d) => d.department.id))
    );

    const isMemberOf = (fn: string) =>
      isGlobalManager ||
      serviceDepts.some((d) => d.function === fn && userDeptIds.has(d.id));

    if (isMemberOf("SECRETARIAT"))
      serviceLinks.push({ href: "/secretariat/announcements", label: "Secrétariat" });
    if (isMemberOf("PRODUCTION_MEDIA"))
      serviceLinks.push({ href: "/media/requests", label: "Visuels" });
    if (isMemberOf("COMMUNICATION"))
      serviceLinks.push({ href: "/communication/requests", label: "Communication" });
  }

  const headerContent = (
    <>
      <div className="min-w-0">
        <h1 className="text-lg md:text-xl font-bold text-white truncate">PlanningCenter</h1>
        {currentChurchId && churches.length > 1 ? (
          <ChurchSwitcher churches={churches} currentChurchId={currentChurchId} />
        ) : (
          <p className="text-xs md:text-sm text-white/70 truncate">{churchName}</p>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        <a href="/guide" title="Guide" data-tour="header-guide" className="text-white hover:text-icc-jaune transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </a>
        <NotificationBell />
        <a href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt={session.user.name || ""}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <span className="hidden sm:inline text-sm text-white">{session.user.name}</span>
        </a>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="px-2 py-1 md:px-3 text-sm text-white/80 border border-white/30 rounded-md hover:bg-white/10 transition-colors"
          >
            <span className="hidden sm:inline">Déconnexion</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );

  const footerContent = (
    <footer className="py-4 text-center text-xs text-gray-400">
      <a
        href="https://github.com/iccbretagne/planningcenter"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-gray-600 transition-colors"
      >
        PlanningCenter
      </a>{" "}
      <span>v{pkg.version}</span>
    </footer>
  );

  const hasDiscipleship = userPermissions.has("discipleship:view");
  const hasEventsAccess = userPermissions.has("events:view");
  const hasEventsManage = userPermissions.has("events:manage");
  const hasPlanningAccess = userPermissions.has("planning:view");
  const hasMembersAccess = userPermissions.has("members:view");
  const hasReports = userPermissions.has("reports:view");

  // Determine the user's primary role for the current church
  const currentRole = churchRoles.find((r) => r.churchId === currentChurchId)?.role ?? "DEPARTMENT_HEAD";

  return (
    <AuthLayoutShell
      departments={allDepartments}
      configLinks={visibleConfigLinks}
      serviceLinks={serviceLinks}
      hasDiscipleship={hasDiscipleship}
      hasEventsAccess={hasEventsAccess}
      hasEventsManage={hasEventsManage}
      hasPlanningAccess={hasPlanningAccess}
      hasMembersAccess={hasMembersAccess}
      hasReports={hasReports}
      userRole={currentRole as "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER"}
      header={headerContent}
      footer={footerContent}
    >
      {children}
    </AuthLayoutShell>
  );
}
