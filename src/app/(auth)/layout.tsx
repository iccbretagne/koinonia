import pkg from "@/../package.json";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth, signOut, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions, registry } from "@/lib/registry";
import { buildMediaSpaceCards, type MediaSpaceAccess } from "@/lib/media-space";
import AuthLayoutShell from "@/components/AuthLayoutShell";
import type { RoleKey as TourRoleKey } from "@/lib/tour-steps";
import { landingHref } from "@/lib/navigation";
import { isPastoralView } from "@/lib/view-mode";

// Liens de la section Configuration (paramétrage — pas les outils quotidiens)
const configLinksDef = [
  // Structure organisationnelle
  { href: "/admin/churches",              label: "Églises",           permissions: ["church:manage"] },
  { href: "/admin/ministries",            label: "Ministères",        permissions: ["departments:manage"] },
  { href: "/admin/departments",           label: "Départements",      permissions: ["departments:manage"] },
  { href: "/admin/departments/functions", label: "Fonctions dép.",    permissions: ["events:manage"] },
  { href: "/admin/rooms",                 label: "Salles",            permissions: ["rooms:manage"] },
  // Personnes
  { href: "/admin/users",                 label: "Utilisateurs",      permissions: ["users:manage"] },
  { href: "/admin/access",                label: "Accès & rôles",     permissions: ["access:manage"] },
  { href: "/admin/pastoral-profiles",     label: "Profils pastoraux", permissions: ["church:manage"] },
  // Système
  { href: "/admin/audit-logs",            label: "Historique",        permissions: ["church:manage"] },
  { href: "/admin/backups",               label: "Sauvegardes",       permissions: [], superAdminOnly: true },
];

export default async function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
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
  const hasClassicRole = churchRoles.some((r) => r.churchId === currentChurchId);
  const isInPastoralMode = isPastoralView({ isPastoral, hasClassicRole, viewModeCookie });
  // Double rôle dans l'église courante : profil pastoral + au moins un rôle classique
  const hasBothRoles = isPastoral && hasClassicRole;

  async function switchToAdminMode() {
    "use server";
    (await cookies()).set("koinonia-view-mode", "admin", { path: "/", maxAge: 2592000 });
    // Même accueil que l'entrée « Accueil » de la navigation (landingHref) plutôt que
    // "/dashboard" en dur : sur une instance qui désactive le module planning, ou pour un
    // rôle sans planning:department (spec 031/#462), ce dernier mènerait à un 404/FORBIDDEN.
    redirect(landingHref({ isPastoral: false, hasPlanningAccess: canAccessDashboard, hasStarPlanning }));
  }
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
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

  // Get departments the user is responsible for (liens Planning). Le rôle STAR est exclu :
  // son champ `departments` porte le département d'APPARTENANCE (fiche membre liée, pour
  // "Mon planning"), pas la responsabilité — sinon on affiche un lien Planning vers un
  // département que l'utilisateur ne gère pas (même fuite qu'ADR-0013 dans getUserDepartmentScope).
  const userDepartmentIds = churchRoles
    .filter((r) => (!currentChurchId || r.churchId === currentChurchId) && r.role !== "STAR")
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
  // Uniquement les rôles détenus dans l'église COURANTE : agréger toutes les églises ici
  // afficherait les liens d'administration d'une église où l'utilisateur n'est qu'Admin
  // ailleurs et simple STAR dans celle-ci (isolation inter-églises, spec 024). Le masquage
  // reste un confort d'affichage — la protection réelle est côté serveur (requireChurchPermission).
  const userRoles = churchRoles
    .filter((r) => r.churchId === currentChurchId)
    .map((r) => r.role);
  const userPermissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  // Utilisé par switchToAdminMode (ci-dessus, fermeture sur une primitive plutôt que sur
  // le Set — plus sûr à sérialiser dans une server action).
  const canAccessDashboard = session.user.isSuperAdmin || userPermissions.has("planning:department");
  // Super admins have all permissions regardless of church roles
  if (session.user.isSuperAdmin) {
    configLinksDef.forEach((l) => l.permissions.forEach((p) => userPermissions.add(p)));
  }
  // Utilisateurs avec un profil pastoral : permissions transversales
  if (isPastoral) {
    userPermissions.add("pastoral:view");
    userPermissions.add("events:view");
    userPermissions.add("discipleship:view");
    userPermissions.add("planning:view");
    userPermissions.add("members:view"); // accès lecture membres + section "Mes demandes"
  }
  const visibleConfigLinks = configLinksDef
    .filter((link) => {
      if (link.superAdminOnly) return session.user.isSuperAdmin;
      return link.permissions.some((p) => userPermissions.has(p));
    })
    .map(({ href, label }) => ({ href, label }));

  // ── Section "Demandes" (workflow requêtes) ──────────────────────────────────
  const requestLinks: { href: string; label: string }[] = [];

  if (userPermissions.has("members:view")) {
    requestLinks.push({ href: "/requests", label: "Mes demandes" });
  }

  // ── Section "Médias" (module Media + dashboards production) ─────────────────
  const mediaLinks: { href: string; label: string; matchPrefixes?: string[] }[] = [];
  let isProtocoleMember = false;

  if (currentChurchId && userPermissions.has("planning:view")) {
    const isGlobalManager = session.user.isSuperAdmin || userPermissions.has("events:manage");

    // One query for all department functions we need to check
    const serviceDepts = await prisma.department.findMany({
      where: {
        function: { in: ["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA", "PROTOCOLE", "PHOTOS"] },
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
      requestLinks.push({ href: "/secretariat/requests", label: "Traitement des demandes" });

    // Espace « Communication & Production » (spec 049, sur le modèle d'Audio — spec 021) :
    // un seul lien de menu, les cartes réellement affichées à l'accueil dépendent de
    // l'équipe/permissions — même logique que `resolveMediaSpaceAccess` (@/lib/media-space),
    // construite ici à partir des données déjà chargées (`serviceDepts`/`isMemberOf`) sans
    // requête supplémentaire. Repli Photos → Production Média si la fonction "Photos" n'est
    // configurée sur aucun département de l'église (voir `isMediaTeamMember`, spec 049).
    const hasPhotoDepts = serviceDepts.some((d) => d.function === "PHOTOS");
    const isPhotoMember = hasPhotoDepts ? isMemberOf("PHOTOS") : isMemberOf("PRODUCTION_MEDIA");
    const isVisualMember = isMemberOf("PRODUCTION_MEDIA");
    const isCommMember = isMemberOf("COMMUNICATION");
    const mediaSpaceAccess: MediaSpaceAccess = {
      photos: userPermissions.has("media:view") || isPhotoMember || isCommMember,
      visuals: userPermissions.has("media:view") || isVisualMember || isCommMember,
      visualRequests: isGlobalManager || isVisualMember,
      social: isGlobalManager || isCommMember,
      share: userPermissions.has("media:manage") || isPhotoMember || isVisualMember || isCommMember,
    };
    if (buildMediaSpaceCards(mediaSpaceAccess).length > 0) {
      mediaLinks.push({
        href: "/media",
        label: "Communication & Production",
        matchPrefixes: ["/media", "/communication"],
      });
    }

    // Protocole check for agenda access (don't inherit from isGlobalManager — role permissions handle that)
    isProtocoleMember = serviceDepts.some((d) => d.function === "PROTOCOLE" && userDeptIds.has(d.id));

    // Spec 043 : pour qui a "members:view" (accès à "Mes demandes"), la demande de RDV
    // pastoral devient une tuile dans /requests/new — lien de menu autonome retiré pour ne
    // pas dupliquer. Le STAR (planning:view sans members:view) n'a pas "Mes demandes" :
    // il garde ce lien autonome, seul moyen d'accès pour lui.
    if (!userPermissions.has("members:view")) {
      requestLinks.push({ href: "/agenda/request", label: "Demande RDV pastoral" });
    }
  }

  // ── Lien "Audio" (spec 021 : un seul lien, onglets à droits distincts derrière) ──
  if (currentChurchId && userPermissions.has("audio:listen")) {
    mediaLinks.push({ href: "/audio", label: "Audio" });
  }

  // ── Section "Intégration familles" ──────────────────────────────────────────
  const integrationLinks: { href: string; label: string }[] = [];

  if (currentChurchId) {
    // integration:manage — remplace events:manage, qui approximait "Admin/Secrétaire" sans
    // couvrir la bonne restriction (spec 054/#583, D4)
    const isIntegrationGlobalManager =
      session.user.isSuperAdmin || userPermissions.has("integration:manage");
    const userDeptIdsSet = new Set(
      churchRoles
        .filter((r) => r.churchId === currentChurchId)
        .flatMap((r) => r.departments.map((d) => d.department.id))
    );
    const isIntegrationMember =
      isIntegrationGlobalManager ||
      (userDeptIdsSet.size > 0 &&
        (await prisma.department.count({
          where: {
            function: { in: ["INTEGRATION", "MSDP"] },
            ministry: { churchId: currentChurchId },
            id: { in: [...userDeptIdsSet] },
          },
        })) > 0);

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
    // Réglage des délais de relance (spec 051) : même règle que requireIntegrationSettingsAccess
    // — Super Admin / events:manage, ou responsable d'un département de fonction INTEGRATION.
    const headDeptIds = churchRoles
      .filter((r) => r.churchId === currentChurchId && r.role === "DEPARTMENT_HEAD")
      .flatMap((r) => r.departments.map((d) => d.department.id));
    const isIntegrationHead =
      headDeptIds.length > 0 &&
      (await prisma.department.count({
        where: { function: "INTEGRATION", ministry: { churchId: currentChurchId }, id: { in: headDeptIds } },
      })) > 0;
    if (isIntegrationGlobalManager || isIntegrationHead) {
      integrationLinks.push({ href: "/integration/parametres", label: "Paramètres intégration" });
    }
  }

  // ── Section "Agenda pastoral" ────────────────────────────────────────────────
  const agendaLinks: { href: string; label: string }[] = [];
  const hasAgendaView = userPermissions.has("agenda:view") || isProtocoleMember;
  const hasAgendaManage = userPermissions.has("agenda:manage") || isProtocoleMember;

  // Profil pastoral lié au compte → lien "Mon agenda" en tête de section
  if (currentChurchId) {
    const ownProfile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, churchId: currentChurchId },
      select: { id: true },
    });
    if (ownProfile) agendaLinks.push({ href: `/agenda/${ownProfile.id}`, label: "Mon agenda" });
  }

  if (hasAgendaView) agendaLinks.push({ href: "/agenda", label: "Vue agenda" });
  if (hasAgendaManage) agendaLinks.push({ href: "/agenda/schedule", label: "Planification" });
  // L'ajout direct à l'agenda (/agenda/new) se fait depuis le bouton « Ajouter à l'agenda » de la
  // vue agenda : ce n'est pas une destination de navigation.

  // Suivi pastoral (spec 052, ADR-0015) : qualification des RDV et suivi des nouveaux
  // convertis, module `care` — remplace l'ancien lien « Qualification » de l'agenda.
  // Accès : care:qualify, care:view, ou accompagnant d'au moins une demande/suivi en charge.
  if (currentChurchId && registry.has("care")) {
    const hasCareOverview =
      userPermissions.has("care:qualify") || userPermissions.has("care:view");
    let isCareAssignee = false;
    if (!hasCareOverview) {
      const { getCareAccess } = await import("@/modules/care");
      const access = await getCareAccess(session, currentChurchId);
      isCareAssignee = access.ownProfileIds.length > 0;
    }
    if (hasCareOverview || isCareAssignee) {
      agendaLinks.push({ href: "/care", label: "Suivi pastoral" });
    }
  }

  const footerContent = (
    <footer className="px-4 py-4 text-center text-xs text-ink-subtle print:hidden">
      <span className="inline-flex items-center gap-1">
        <a
          href="https://github.com/iccbretagne/koinonia"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-chip transition-colors hover:text-ink-muted"
        >
          Koinonia
        </a>
        {/*
          En production, `package.json` porte la version du tag deploye : elle suffit.
          En recette on deploie une branche quelconque, dont le `package.json` reste fige
          sur la derniere version publiee — le footer afficherait donc une version qui
          n'est pas celle qu'on teste. `NEXT_PUBLIC_BUILD_VERSION` (inline au build par
          deploy-staging.yml, forme `1.18.0-abc1234`) prend alors le relais.
        */}
        <span className="tabular-nums">v{process.env.NEXT_PUBLIC_BUILD_VERSION ?? pkg.version}</span>
      </span>
    </footer>
  );

  const famillesUrl = process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

  const hasDiscipleship = userPermissions.has("discipleship:view");
  const hasAccounting = userPermissions.has("accounting:view");
  const hasJobs = userPermissions.has("jobs:view");
  const hasEventsAccess = userPermissions.has("events:view");
  const hasEventsManage = userPermissions.has("events:manage");
  // Entrée de sidebar "Planning" (grille par département, /dashboard) — spec 031/#462 :
  // le STAR n'a pas planning:department, contrairement à planning:view.
  const hasPlanningAccess = userPermissions.has("planning:department");
  const hasMembersAccess = userPermissions.has("members:view");
  const hasReports = userPermissions.has("reports:view");
  const hasRooms = userPermissions.has("rooms:view");
  // "Mon planning", événements STAR et absences reposent sur planning:view (conservé
  // par le STAR), volontairement dissocié de hasPlanningAccess (spec 031/#462).
  const hasStarPlanning = userPermissions.has("planning:view");
  // Entrée "Événements" hebdomadaire (STAR) — mutuellement exclusive avec la
  // section Événements existante (Liste/Calendrier), réservée à events:view.
  const showStarEvents = hasStarPlanning && !hasEventsAccess;

  // "Mon planning" — visible pour tout utilisateur lié à un STAR dans l'église courante
  const memberLink = currentChurchId
    ? await prisma.memberUserLink.findUnique({
        where: { userId_churchId: { userId: session.user.id!, churchId: currentChurchId } },
        select: { id: true },
      })
    : null;
  const hasMyPlanning = hasStarPlanning && memberLink !== null;

  // "Disponibilités" (spec 058) — tout compte lié à une fiche STAR ; "Indisponibilités" —
  // responsable/ministre/admin ayant la permission de vue transverse.
  const hasAvailability = memberLink !== null;
  const hasAbsences = userPermissions.has("absences:view");

  // Determine the user's primary role for the current church
  const currentRole = churchRoles.find((r) => r.churchId === currentChurchId)?.role ?? "DEPARTMENT_HEAD";

  // Spec 038 (CA10) : un utilisateur dont TOUS les rôles ne portent que sur des modules
  // désactivés sur cette instance (ex. Comptable sans le module accounting) conserve un
  // `churchRoles.length > 0` — le garde-fou de tête (ligne ~47) ne le voit donc pas. Le
  // critère réel est « aucune entrée de navigation disponible », vérifié ici une fois
  // toutes les sections construites. Aucun écran ni message spécifique à la désactivation
  // n'est ajouté : c'est le même parcours « aucun accès » que pour un utilisateur sans
  // rôle du tout.
  const hasAnyNavigation =
    session.user.isSuperAdmin ||
    visibleConfigLinks.length > 0 ||
    requestLinks.length > 0 ||
    mediaLinks.length > 0 ||
    integrationLinks.length > 0 ||
    agendaLinks.length > 0 ||
    hasDiscipleship ||
    hasAccounting ||
    hasJobs ||
    hasEventsAccess ||
    hasPlanningAccess ||
    hasMembersAccess ||
    hasReports ||
    hasRooms ||
    hasMyPlanning ||
    showStarEvents ||
    hasAbsences ||
    hasAvailability;

  if (!hasAnyNavigation) {
    redirect("/no-access");
  }

  return (
    <AuthLayoutShell
      departments={allDepartments}
      configLinks={visibleConfigLinks}
      requestLinks={requestLinks}
      mediaLinks={mediaLinks}
      agendaLinks={agendaLinks}
      integrationLinks={integrationLinks}
      famillesUrl={famillesUrl}
      hasDiscipleship={hasDiscipleship}
      hasAccounting={hasAccounting}
      hasJobs={hasJobs}
      isPastoral={isInPastoralMode}
      hasEventsAccess={hasEventsAccess}
      hasEventsManage={hasEventsManage}
      hasPlanningAccess={hasPlanningAccess}
      hasMembersAccess={hasMembersAccess}
      hasReports={hasReports}
      hasMyPlanning={hasMyPlanning}
      showStarEvents={showStarEvents}
      hasAbsences={hasAbsences}
      hasAvailability={hasAvailability}
      hasRooms={hasRooms}
      homeHref={landingHref({ isPastoral: isInPastoralMode, hasPlanningAccess, hasStarPlanning })}
      userRole={currentRole as TourRoleKey}
      user={{ name: session.user.name ?? null, email: session.user.email ?? null, image: session.user.image ?? null }}
      churches={churches}
      currentChurchId={currentChurchId ?? null}
      churchName={churchName}
      headerColor={churchPrimaryColor}
      hasBothRoles={hasBothRoles}
      switchViewAction={isInPastoralMode ? switchToAdminMode : switchToPastoralMode}
      signOutAction={signOutAction}
      footer={footerContent}
    >
      {children}
    </AuthLayoutShell>
  );
}
