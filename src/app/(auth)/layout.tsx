import pkg from "@/../package.json";
import { redirect } from "next/navigation";
import { auth, signOut, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import ChurchSwitcher from "@/components/ChurchSwitcher";
import AuthLayoutShell from "@/components/AuthLayoutShell";
import NotificationBell from "@/components/NotificationBell";

const adminLinks = [
  { href: "/admin/churches", label: "Églises", permissions: ["church:manage"] },
  { href: "/admin/users", label: "Utilisateurs", permissions: ["members:manage"] },
  { href: "/admin/ministries", label: "Ministères", permissions: ["departments:manage"] },
  { href: "/admin/departments", label: "Départements", permissions: ["departments:manage"] },
  { href: "/admin/members", label: "STAR", permissions: ["members:manage", "members:view"] },
  { href: "/admin/events", label: "Événements", permissions: ["events:manage"] },
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
      where: { ministry: { churchId: currentChurchId } },
      include: { ministry: true },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
    });
    allDepartments = depts.map((d) => ({ id: d.id, name: d.name }));
  }

  // Compute visible admin links
  const userRoles = churchRoles.map((r) => r.role);
  const userPermissions = new Set(userRoles.flatMap((r) => hasPermission(r)));
  const visibleAdminLinks = adminLinks
    .filter((link) => link.permissions.some((p) => userPermissions.has(p)))
    .map(({ href, label }) => ({ href, label }));

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
        <a href="/guide" title="Guide" className="text-white hover:text-icc-jaune transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </a>
        <NotificationBell />
        {session.user.image && (
          <img
            src={session.user.image}
            alt={session.user.name || ""}
            className="w-8 h-8 rounded-full"
          />
        )}
        <span className="hidden sm:inline text-sm text-white">{session.user.name}</span>
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

  return (
    <AuthLayoutShell
      departments={allDepartments}
      adminLinks={visibleAdminLinks}
      hasAdminAccess={visibleAdminLinks.length > 0}
      header={headerContent}
      footer={footerContent}
    >
      {children}
    </AuthLayoutShell>
  );
}
