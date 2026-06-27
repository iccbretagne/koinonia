import pkg from "@/../package.json";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import { auth, signOut, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions, registry } from "@/lib/registry";
import ChurchSwitcher from "@/components/ChurchSwitcher";
import AuthLayoutShell from "@/components/AuthLayoutShell";
import NotificationBell from "@/components/NotificationBell";

// Liens de la section Configuration (paramétrage — pas les outils quotidiens)
const configLinksDef = [
  // Structure organisationnelle
  { href: "/admin/churches",              label: "Églises",           permissions: ["church:manage"] },
  { href: "/admin/ministries",            label: "Ministères",        permissions: ["departments:manage"] },
  { href: "/admin/departments",           label: "Départements",      permissions: ["departments:manage"] },
  { href: "/admin/departments/functions", label: "Fonctions dép.",    permissions: ["events:manage"] },
  // Personnes
  { href: "/admin/users",                 label: "Utilisateurs",      permissions: ["members:manage"] },
  { href: "/admin/access",                label: "Accès & rôles",     permissions: ["departments:manage"] },
  { href: "/admin/pastoral-profiles",     label: "Profils pastoraux", permissions: ["church:manage"] },
  // Système
  { href: "/admin/audit-logs",            label: "Historique",        permissions: ["church:manage"] },
  { href: "/admin/backups",               label: "Sauvegardes",       permissions: [], superAdminOnly: true },
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
  const pastoralChurchIds = session.user.pastoralChurchIds ?? [];

  const hasPastoralProfile = pastoralChurchIds.length > 0;

  if (!session.user.isSuperAdmin && churchRoles.length === 0 && !hasPastoralProfile) {
    redirect("/no-access");
  }

  const currentChurchId = await getCurrentChurchId(session);

  // isPastoral : l'utilisateur a un profil pastoral dans l'église courante
  const isPastoral = currentChurchId
    ? pastoralChurchIds.includes(currentChurchId)
    : hasPastoralProfile;

  // Mode d'affichage : cookie pour persister le choix entre vue pastorale et vue admin
  const cookieStore = await cookies();
  const viewModeCookie = cookieStore.get("koinonia-view-mode")?.value;
  const isInPastoralMode = isPastoral && viewModeCookie !== "admin";
  // Double rôle dans l'église courante : profil pastoral + au moins un rôle classique
  const hasBothRoles = isPastoral && churchRoles.some((r) => r.churchId === currentChurchId);

  async function switchToAdminMode() {
    "use server";
    (await cookies()).set("koinonia-view-mode", "admin", { path: "/", maxAge: 2592000 });
    redirect("/dashboard");
  }
  async function switchToPastoralMode() {
    "use server";
    (await cookies()).set("koinonia-view-mode", "pastoral", { path: "/", maxAge: 2592000 });
    redirect("/pastoral");
  }

  const currentChurchDb = currentChurchId
    ? await prisma.church.findUnique({ where: { id: currentChurchId }, select: { name: true, primaryColor: true } })
    : null;
  const churchName = currentChurchDb?.name ?? "Église";
  const churchPrimaryColor = currentChurchDb?.primaryColor ?? "#5E17EB";

  // Inclure les églises des profils pastoraux dans le switcher
  const churchMap = new Map(
    churchRoles.map((r) => [r.churchId, { id: r.churchId, name: r.church.name }])
  );
  const pastoralOnlyIds = pastoralChurchIds.filter((id) => !churchMap.has(id));
  if (pastoralOnlyIds.length > 0) {
    const pastoralChurchData = await prisma.church.findMany({
      where: { id: { in: pastoralOnlyIds } },
      select: { id: true, name: true },
    });
    for (const c of pastoralChurchData) churchMap.set(c.id, c);
  }
  const churches = Array.from(churchMap.values());

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
  const userPermissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  // Super admins have all permissions regardless of church roles
  if (session.user.isSuperAdmin) {
    configLinksDef.forEach((l) => l.permissions.forEach((p) => userPermissions.add(p)));
  }
  // Utilisateurs avec un profil pastoral : permissions transversales
  if (isPastoral) {
    userPermissions.add("pastoral:view");
    userPermissions.add("events:view");
    userPermissions.add("discipleship:view");
    userPermissions.add("planning:view"); // permet "Mes demandes"
  }
  const visibleConfigLinks = configLinksDef
    .filter((link) => {
      if (link.superAdminOnly) return session.user.isSuperAdmin;
      return link.permissions.some((p) => userPermissions.has(p));
    })
    .map(({ href, label }) => ({ href, label }));

  // ── Section "Demandes" (workflow requêtes) ──────────────────────────────────
  const requestLinks: { href: string; label: string }[] = [];

  if (userPermissions.has("planning:view")) {
    requestLinks.push({ href: "/requests", label: "Mes demandes" });
  }

  // ── Section "Médias" (module Media + dashboards production) ─────────────────
  const mediaLinks: { href: string; label: string }[] = [];
  let isProtocoleMember = false;

  if (currentChurchId && userPermissions.has("planning:view")) {
    const isGlobalManager = session.user.isSuperAdmin || userPermissions.has("events:manage");

    // One query for all department functions we need to check
    const serviceDepts = await prisma.department.findMany({
      where: {
        function: { in: ["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA", "PROTOCOLE"] },
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
      requestLinks.push({ href: "/secretariat/requests", label: "Gestion" });
    if (isMemberOf("PRODUCTION_MEDIA"))
      mediaLinks.push({ href: "/media/requests", label: "Visuels" });
    if (isMemberOf("COMMUNICATION"))
      mediaLinks.push({ href: "/communication/requests", label: "Communication" });

    if (userPermissions.has("media:view") || isMemberOf("PRODUCTION_MEDIA") || isMemberOf("COMMUNICATION")) {
      mediaLinks.push({ href: "/media/events", label: "Événements" });
      mediaLinks.push({ href: "/media/projects", label: "Projets" });
    }
    if (userPermissions.has("media:manage") || isMemberOf("PRODUCTION_MEDIA")) {
      mediaLinks.push({ href: "/media/collections", label: "Collections" });
    }

    // Protocole check for agenda access (don't inherit from isGlobalManager — role permissions handle that)
    isProtocoleMember = serviceDepts.some((d) => d.function === "PROTOCOLE" && userDeptIds.has(d.id));

    requestLinks.push({ href: "/agenda/request", label: "Demande RDV pastoral" });
  }

  // ── Section "Intégration familles" ──────────────────────────────────────────
  const integrationLinks: { href: string; label: string }[] = [];

  if (currentChurchId) {
    const isGlobalManager = session.user.isSuperAdmin || userPermissions.has("events:manage");
    const userDeptIdsSet = new Set(
      churchRoles
        .filter((r) => r.churchId === currentChurchId)
        .flatMap((r) => r.departments.map((d) => d.department.id))
    );
    const integrationDept = await prisma.department.findFirst({
      where: { function: "INTEGRATION", ministry: { churchId: currentChurchId } },
      select: { id: true },
    });
    const isIntegrationMember =
      isGlobalManager ||
      (integrationDept ? userDeptIdsSet.has(integrationDept.id) : false);

    const isBerger = await prisma.familyLeaderAssignment.count({
      where: { churchId: currentChurchId, userId: session.user.id! },
    }).then((c) => c > 0);

    if (isIntegrationMember || isBerger) {
      integrationLinks.push({ href: "/integration/requests", label: "Intégration" });
    }
    if (isIntegrationMember) {
      integrationLinks.push({ href: "/integration/leaders", label: "Bergers de famille" });
      integrationLinks.push({ href: "/integration/parcours", label: "Parcours d'intégration" });
      integrationLinks.push({ href: "/integration/stats", label: "Statistiques intégration" });
    }
  }

  // ── Section "Agenda pastoral" ────────────────────────────────────────────────
  const agendaLinks: { href: string; label: string }[] = [];
  const hasAgendaView = userPermissions.has("agenda:view") || isProtocoleMember;
  const hasAgendaManage = userPermissions.has("agenda:manage") || isProtocoleMember;
  const hasAgendaQualify = userPermissions.has("agenda:qualify");

  // Profil pastoral lié au compte → lien "Mon agenda" en tête de section
  if (currentChurchId) {
    const ownProfile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, churchId: currentChurchId },
      select: { id: true },
    });
    if (ownProfile) agendaLinks.push({ href: `/agenda/${ownProfile.id}`, label: "Mon agenda" });
  }

  if (hasAgendaView) agendaLinks.push({ href: "/agenda", label: "Vue agenda" });
  if (hasAgendaQualify) agendaLinks.push({ href: "/agenda/requests", label: "Qualification" });
  if (hasAgendaManage) agendaLinks.push({ href: "/agenda/schedule", label: "Planification" });
  if (hasAgendaManage) agendaLinks.push({ href: "/agenda/new", label: "Nouvelle entrée" });

  const headerContent = (
    <div className="flex items-center w-full min-w-0">
      <div className="min-w-0">
        <h1 className="text-lg md:text-xl font-bold text-current truncate">Koinonia</h1>
        {currentChurchId && churches.length > 1 ? (
          <ChurchSwitcher churches={churches} currentChurchId={currentChurchId} />
        ) : (
          <p className="text-xs md:text-sm opacity-70 truncate">{churchName}</p>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        {hasBothRoles && (
          <form action={isInPastoralMode ? switchToAdminMode : switchToPastoralMode}>
            <button
              type="submit"
              title={isInPastoralMode ? "Basculer vers la vue administration" : "Basculer vers la vue pastorale"}
              className="flex items-center gap-1.5 text-xs border border-current/30 rounded-md px-2 py-1.5 sm:px-3 opacity-80 hover:opacity-100 hover:bg-black/10 transition-all whitespace-nowrap"
            >
              {isInPastoralMode ? (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span className="hidden sm:inline">Vue admin</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="hidden sm:inline">Vue pastorale</span>
                </>
              )}
            </button>
          </form>
        )}
        <a href="/guide" title="Guide" data-tour="header-guide" className="text-current opacity-80 hover:opacity-100 transition-opacity">
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
          <span className="hidden sm:inline text-sm text-current">{session.user.name}</span>
        </a>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="px-2 py-1 md:px-3 text-sm opacity-80 border border-current/30 rounded-md hover:opacity-100 hover:bg-black/10 transition-colors"
          >
            <span className="hidden sm:inline">Déconnexion</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );

  const footerContent = (
    <footer className="pt-4 pb-20 md:py-4 text-center text-xs text-gray-400">
      <span className="inline-flex items-center gap-1">
        <a
          href="https://github.com/iccbretagne/koinonia"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          Koinonia
        </a>
        <span>v{pkg.version}</span>
      </span>
    </footer>
  );

  // ── Module MRBS (optionnel) ───────────────────────────────────────────────
  const mrbsUrl = registry.has("mrbs") ? (process.env.MRBS_URL ?? null) : null;
  const mrbsAdminLink =
    registry.has("mrbs") && userPermissions.has("mrbs:manage")
      ? "/admin/mrbs-links"
      : null;

  const famillesUrl = process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

  const hasDiscipleship = userPermissions.has("discipleship:view");
  const hasAccounting = userPermissions.has("accounting:view");
  const hasJobs = userPermissions.has("jobs:view");
  const hasJobsManage = userPermissions.has("jobs:manage");
  const hasEventsAccess = userPermissions.has("events:view");
  const hasEventsManage = userPermissions.has("events:manage");
  const hasPlanningAccess = userPermissions.has("planning:view");
  const hasMembersAccess = userPermissions.has("members:view");
  const hasReports = userPermissions.has("reports:view");

  // "Mon planning" — visible pour tout utilisateur lié à un STAR dans l'église courante
  const memberLink = currentChurchId
    ? await prisma.memberUserLink.findUnique({
        where: { userId_churchId: { userId: session.user.id!, churchId: currentChurchId } },
        select: { id: true },
      })
    : null;
  const hasMyPlanning = hasPlanningAccess && memberLink !== null;

  // Determine the user's primary role for the current church
  const currentRole = churchRoles.find((r) => r.churchId === currentChurchId)?.role ?? "DEPARTMENT_HEAD";

  return (
    <AuthLayoutShell
      departments={allDepartments}
      configLinks={visibleConfigLinks}
      requestLinks={requestLinks}
      mediaLinks={mediaLinks}
      agendaLinks={agendaLinks}
      integrationLinks={integrationLinks}
      mrbsUrl={mrbsUrl}
      mrbsAdminLink={mrbsAdminLink}
      famillesUrl={famillesUrl}
      hasDiscipleship={hasDiscipleship}
      hasAccounting={hasAccounting}
      hasJobs={hasJobs}
      hasJobsManage={hasJobsManage}
      isPastoral={isInPastoralMode}
      hasEventsAccess={hasEventsAccess}
      hasEventsManage={hasEventsManage}
      hasPlanningAccess={hasPlanningAccess}
      hasMembersAccess={hasMembersAccess}
      hasReports={hasReports}
      hasMyPlanning={hasMyPlanning}
      userRole={currentRole as "SUPER_ADMIN" | "ADMIN" | "SECRETARY" | "MINISTER" | "DEPARTMENT_HEAD" | "DISCIPLE_MAKER" | "REPORTER" | "STAR" | "ACCOUNTANT"}
      headerColor={churchPrimaryColor}
      header={headerContent}
      footer={footerContent}
    >
      {children}
    </AuthLayoutShell>
  );
}
