import { prisma } from "@/lib/prisma";
import { rolePermissions, registry } from "@/lib/registry";
import { buildMediaSpaceCards, type MediaSpaceAccess } from "@/lib/media-space";
import { primaryRole } from "@/lib/roles";
import { isShuttleVisible } from "@/modules/shuttle/auth";
import { isTreasuryVisible } from "@/modules/treasury/auth";
import { isTicketingVisible } from "@/modules/ticketing/auth";
import type { NavigationInput } from "@/lib/navigation";
import type { Session } from "next-auth";
import { paths, PREFIXES } from "@/lib/paths";

/**
 * Entrées de navigation de l'espace authentifié, extraites de `(auth)/layout.tsx` (spec 092,
 * lot 1) : droits d'affichage de l'église courante, liens par équipe de service, booléens `has*`.
 * Mêmes requêtes, dans le même ordre, qu'avant l'extraction. Ce module ne décide d'aucun droit :
 * le masquage est un confort d'affichage, la protection réelle reste côté serveur.
 */


export type NavLink = { href: string; label: string };
export type ChurchRoles = Session["user"]["churchRoles"];

// Liens de la section Configuration (paramétrage — pas les outils quotidiens)
const configLinksDef = [
  // Structure organisationnelle
  { href: paths.admin.churches(),              label: "Églises",           permissions: ["church:manage"] },
  { href: paths.admin.ministries(),            label: "Ministères",        permissions: ["departments:manage"] },
  { href: paths.admin.departments(),           label: "Départements",      permissions: ["departments:manage"] },
  { href: paths.admin.departmentFunctions(), label: "Fonctions des départements",    permissions: ["events:manage"] },
  { href: paths.admin.rooms(),                 label: "Configuration des salles",            permissions: ["rooms:manage"] },
  // Messages système (spec 071) : masqué si le module n'est pas actif, même pour un Super Admin
  ...(registry.has("messages") ? [{ href: paths.admin.messages(), label: "Messages système", permissions: ["messages:publish"] }] : []),
  // Personnes
  { href: paths.admin.users(),                 label: "Utilisateurs",      permissions: ["users:manage"] },
  { href: paths.admin.access(),                label: "Accès & rôles",     permissions: ["access:manage"] },
  { href: paths.admin.pastoralProfiles(),     label: "Profils pastoraux", permissions: ["church:settings"] },
  // Finances (spec 065) : rangée dans l'espace Finances par `buildSpaces` : masqué si le module n'est pas actif, même pour un Super Admin
  ...(registry.has("giving") ? [{ href: paths.dons(), label: "Page de dons", permissions: ["giving:manage"] }] : []),
  // Système
  { href: paths.admin.auditLogs(),            label: "Historique",        permissions: ["church:settings"] },
  { href: paths.admin.backups(),               label: "Sauvegardes",       permissions: [], superAdminOnly: true },
  { href: paths.admin.api(),                   label: "API",               permissions: [], superAdminOnly: true },
  { href: paths.admin.appIcon(),              label: "Icône de l'application", permissions: [], superAdminOnly: true },
  ...(registry.has("ticketing") ? [{ href: paths.admin.siteDomains(), label: "Domaines des sites", permissions: [] as string[], superAdminOnly: true }] : []),
  // Assistant de prise en main (spec 075) : base commune à l'instance
  ...(registry.has("assistant") ? [{ href: paths.admin.assistant(), label: "Assistant", permissions: [] as string[], superAdminOnly: true }] : []),
  ...(registry.has("mcp") ? [{ href: paths.admin.mcp(), label: "Assistants IA", permissions: [] as string[], superAdminOnly: true }] : []),
];


/**
 * Départements des liens Planning : ceux dont l'utilisateur est responsable, ou tous ceux de
 * l'église pour l'administration. Le rôle STAR est exclu : son champ `departments` porte le
 * département d'APPARTENANCE (fiche membre liée, pour "Mon planning"), pas la responsabilité —
 * sinon on affiche un lien Planning vers un département que l'utilisateur ne gère pas (même
 * fuite qu'ADR-0013 dans getUserDepartmentScope).
 */
async function planningDepartments(churchRoles: ChurchRoles, currentChurchId: string | null | undefined) {
  // For super admins / admins, show all departments
  const isAdmin = churchRoles.some(
    (r) =>
      r.churchId === currentChurchId &&
      (r.role === "SUPER_ADMIN" || r.role === "ADMIN" || r.role === "SECRETARY")
  );
  if (isAdmin && currentChurchId) {
    const depts = await prisma.department.findMany({
      where: { ministry: { churchId: currentChurchId }, isSystem: false },
      include: { ministry: true },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
    });
    return depts.map((d) => ({ id: d.id, name: d.name, ministryName: d.ministry.name }));
  }

  const userDepartmentIds = churchRoles
    .filter((r) => (!currentChurchId || r.churchId === currentChurchId) && r.role !== "STAR")
    .flatMap((r) => r.departments.map((d) => d.department));
  return Array.from(new Map(userDepartmentIds.map((d) => [d.id, d])).values());
}

/**
 * Permissions d'affichage dans l'église COURANTE uniquement : agréger toutes les églises
 * afficherait les liens d'administration d'une église où l'utilisateur n'est qu'Admin ailleurs
 * et simple STAR dans celle-ci (isolation inter-églises, spec 024). Le masquage reste un confort
 * d'affichage — la protection réelle est côté serveur (requireChurchPermission).
 */
function displayPermissions(churchRoles: ChurchRoles, currentChurchId: string | null | undefined, isSuperAdmin: boolean, isPastoral: boolean) {
  const userRoles = churchRoles.filter((r) => r.churchId === currentChurchId).map((r) => r.role);
  const userPermissions = new Set(userRoles.flatMap((r) => rolePermissions[r] ?? []));
  // Utilisé par switchToAdminMode (fermeture sur une primitive plutôt que sur le Set — plus
  // sûr à sérialiser dans une server action).
  const canAccessDashboard = isSuperAdmin || userPermissions.has("planning:department");
  // Super admins have all permissions regardless of church roles
  if (isSuperAdmin) {
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
  return { userPermissions, canAccessDashboard };
}

function configLinks(userPermissions: Set<string>, isSuperAdmin: boolean, currentChurchId: string | null | undefined) {
  const visibleConfigLinks: NavLink[] = configLinksDef
    .filter((link) => {
      if (link.superAdminOnly) return isSuperAdmin;
      return link.permissions.some((p) => userPermissions.has(p));
    })
    .map(({ href, label }) => ({ href, label }));
  // Les paramètres de l'église courante (church:settings) : un Admin les rejoint directement, le
  // Super Admin les retrouve en plus de la liste des églises (espace Plateforme).
  if (currentChurchId && userPermissions.has("church:settings")) {
    visibleConfigLinks.unshift({ href: paths.admin.church(currentChurchId), label: "Paramètres de l'église" });
  }
  return visibleConfigLinks;
}

/** Départements de l'utilisateur dans l'église courante (appartenance ou responsabilité). */
function currentDepartmentIds(churchRoles: ChurchRoles, currentChurchId: string) {
  return new Set(
    churchRoles
      .filter((r) => r.churchId === currentChurchId)
      .flatMap((r) => r.departments.map((d) => d.department.id))
  );
}

/**
 * Liens issus des équipes de service (Secrétariat, Communication, Production Média, Photos,
 * Protocole) : traitement des demandes, espace « Communication & Production », RDV pastoral.
 */
async function serviceTeamLinks(
  churchRoles: ChurchRoles,
  currentChurchId: string,
  userPermissions: Set<string>,
  isSuperAdmin: boolean
) {
  const requestLinks: NavLink[] = [];
  const mediaLinks: (NavLink & { matchPrefixes?: string[] })[] = [];
  const isGlobalManager = isSuperAdmin || userPermissions.has("events:manage");

  // One query for all department functions we need to check
  const serviceDepts = await prisma.department.findMany({
    where: {
      function: { in: ["SECRETARIAT", "COMMUNICATION", "PRODUCTION_MEDIA", "PROTOCOLE", "PHOTOS"] },
      ministry: { churchId: currentChurchId },
    },
    select: { id: true, function: true, ministryId: true },
  });
  const userDeptIds = currentDepartmentIds(churchRoles, currentChurchId);
  const isInTeam = (fn: string) => serviceDepts.some((d) => d.function === fn && userDeptIds.has(d.id));
  const isMemberOf = (fn: string) => isGlobalManager || isInTeam(fn);

  if (isMemberOf("SECRETARIAT"))
    requestLinks.push({ href: paths.secretariat.requests(), label: "Traitement des demandes" });

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
  // Ministre d'un ministère qui porte une équipe média (spec 080, même règle que `isMediaMinister`).
  const ministerMinistryIds = new Set(
    churchRoles.filter((r) => r.churchId === currentChurchId && r.role === "MINISTER" && r.ministryId).map((r) => r.ministryId)
  );
  const isMediaMinister = serviceDepts.some(
    (d) => ["PHOTOS", "PRODUCTION_MEDIA", "COMMUNICATION"].includes(d.function ?? "") && ministerMinistryIds.has(d.ministryId)
  );
  const mediaSpaceAccess: MediaSpaceAccess = {
    photos: userPermissions.has("media:view") || isPhotoMember || isCommMember,
    visuals: userPermissions.has("media:view") || isVisualMember || isCommMember,
    visualRequests: isGlobalManager || isVisualMember,
    social: isGlobalManager || isCommMember,
    share: userPermissions.has("media:manage") || isPhotoMember || isVisualMember || isCommMember,
    gallery: userPermissions.has("media:view") || isPhotoMember || isVisualMember || isCommMember || isMediaMinister,
  };
  if (buildMediaSpaceCards(mediaSpaceAccess).length > 0) {
    mediaLinks.push({
      href: paths.media(),
      label: "Communication & Production",
      matchPrefixes: [paths.media(), PREFIXES.communication],
    });
  }

  // Spec 043 : pour qui a "members:view" (accès à "Mes demandes"), la demande de RDV
  // pastoral devient une tuile dans /requests/new — lien de menu autonome retiré pour ne
  // pas dupliquer. Le STAR (planning:view sans members:view) n'a pas "Mes demandes" :
  // il garde ce lien autonome, seul moyen d'accès pour lui.
  if (!userPermissions.has("members:view")) {
    requestLinks.push({ href: paths.care.request(), label: "Demander un rendez-vous" });
  }

  // Protocole check for agenda access (don't inherit from isGlobalManager — role permissions handle that)
  return { requestLinks, mediaLinks, isProtocoleMember: isInTeam("PROTOCOLE") };
}

/** Sections « Demandes » (workflow requêtes) et « Médias » (module Media, production, audio). */
async function requestAndMediaLinks(
  churchRoles: ChurchRoles,
  currentChurchId: string | null | undefined,
  userPermissions: Set<string>,
  isSuperAdmin: boolean,
  userId: string
) {
  const requestLinks: NavLink[] = [];
  const mediaLinks: (NavLink & { matchPrefixes?: string[] })[] = [];
  let isProtocoleMember = false;

  if (userPermissions.has("members:view")) {
    requestLinks.push({ href: paths.requests(), label: "Mes demandes" });
  }
  if (currentChurchId && userPermissions.has("planning:view")) {
    const teamLinks = await serviceTeamLinks(churchRoles, currentChurchId, userPermissions, isSuperAdmin);
    requestLinks.push(...teamLinks.requestLinks);
    mediaLinks.push(...teamLinks.mediaLinks);
    isProtocoleMember = teamLinks.isProtocoleMember;
  }
  // Accès nominatif à la galerie (spec 080) : seule voie vers l'espace pour un compte sans
  // équipe média — une requête, seulement si le lien n'est pas déjà là.
  const hasChurchRole = churchRoles.some((r) => r.churchId === currentChurchId);
  if (currentChurchId && hasChurchRole && !mediaLinks.some((l) => l.href === paths.media())) {
    const grant = await prisma.mediaGalleryGrant.findUnique({
      where: { churchId_userId: { churchId: currentChurchId, userId } },
      select: { expiresAt: true },
    });
    if (grant && (grant.expiresAt === null || grant.expiresAt > new Date())) {
      mediaLinks.unshift({ href: paths.media(), label: "Communication & Production", matchPrefixes: [paths.media(), PREFIXES.communication] });
    }
  }
  // Lien "Audio" (spec 021 : un seul lien, onglets à droits distincts derrière)
  if (currentChurchId && userPermissions.has("audio:listen")) {
    mediaLinks.push({ href: paths.audio(), label: "Audio" });
  }
  return { requestLinks, mediaLinks, isProtocoleMember };
}

/** Un des départements donnés de l'église porte l'une des fonctions données. */
async function hasDepartmentWithFunction(churchId: string, deptIds: string[], functions: string[]) {
  if (deptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: {
      function: functions.length === 1 ? functions[0] : { in: functions },
      ministry: { churchId },
      id: { in: deptIds },
    },
  });
  return count > 0;
}

/** Section « Intégration familles ». */
async function integrationLinks(
  churchRoles: ChurchRoles,
  currentChurchId: string,
  userId: string,
  userPermissions: Set<string>,
  isSuperAdmin: boolean
) {
  const links: NavLink[] = [];
  // integration:manage — remplace events:manage, qui approximait "Admin/Secrétaire" sans
  // couvrir la bonne restriction (spec 054/#583, D4)
  const isIntegrationGlobalManager = isSuperAdmin || userPermissions.has("integration:manage");
  const isIntegrationMember =
    isIntegrationGlobalManager ||
    (await hasDepartmentWithFunction(currentChurchId, [...currentDepartmentIds(churchRoles, currentChurchId)], ["INTEGRATION", "MSDP"]));

  const isBerger = await prisma.familyLeaderAssignment.count({
    where: { churchId: currentChurchId, userId },
  }).then((c) => c > 0);

  if (isIntegrationMember || isBerger) {
    links.push({ href: paths.integration.requests(), label: "Dossiers d'intégration" });
  }
  if (isIntegrationMember) {
    links.push(
      { href: paths.integration.leaders(), label: "Bergers de famille" },
      { href: paths.integration.parcours(), label: "Parcours d'intégration" },
      { href: paths.integration.stats(), label: "Statistiques intégration" },
    );
  }
  // Réglage des délais de relance (spec 051) : même règle que requireIntegrationSettingsAccess
  // — Super Admin / events:manage, ou responsable d'un département de fonction INTEGRATION.
  const headDeptIds = churchRoles
    .filter((r) => r.churchId === currentChurchId && r.role === "DEPARTMENT_HEAD")
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (isIntegrationGlobalManager || (await hasDepartmentWithFunction(currentChurchId, headDeptIds, ["INTEGRATION"]))) {
    links.push({ href: paths.integration.parametres(), label: "Paramètres intégration" });
  }
  return links;
}

/** Section « Agenda pastoral », avec le suivi pastoral (module care). */
async function agendaLinks(
  session: Session,
  currentChurchId: string | null | undefined,
  userPermissions: Set<string>,
  isProtocoleMember: boolean
) {
  const links: NavLink[] = [];

  // Profil pastoral lié au compte → lien "Mon agenda" en tête de section
  if (currentChurchId) {
    const ownProfile = await prisma.pastoralProfile.findFirst({
      where: { userId: session.user.id, churchId: currentChurchId },
      select: { id: true },
    });
    if (ownProfile) links.push({ href: paths.agenda.profile(ownProfile.id), label: "Mon agenda" });
  }

  if (userPermissions.has("agenda:view") || isProtocoleMember) links.push({ href: paths.agenda(), label: "Agenda des pasteurs" });
  if (userPermissions.has("agenda:manage") || isProtocoleMember) links.push({ href: paths.agenda.schedule(), label: "Planification" });
  // L'ajout direct à l'agenda (/agenda/new) se fait depuis le bouton « Ajouter à l'agenda » de la
  // vue agenda : ce n'est pas une destination de navigation.

  // Suivi pastoral (spec 052, ADR-0015) : qualification des RDV et suivi des nouveaux
  // convertis, module `care` — remplace l'ancien lien « Qualification » de l'agenda.
  // Accès : care:qualify, care:view, ou accompagnant d'au moins une demande/suivi en charge.
  if (currentChurchId && registry.has("care") && (await hasCareAccess(session, currentChurchId, userPermissions))) {
    links.push({ href: paths.care(), label: "Suivi pastoral" });
  }
  return links;
}

async function hasCareAccess(session: Session, churchId: string, userPermissions: Set<string>) {
  if (userPermissions.has("care:qualify") || userPermissions.has("care:view")) return true;
  const { getCareAccess } = await import("@/modules/care");
  const access = await getCareAccess(session, churchId);
  return access.ownProfileIds.length > 0;
}

/**
 * « Trame des annonces » (#676) : même règle que la page et l'API — `planning:view` puis
 * `canReadAnnouncementSheet` (déposants, ministres/responsables à périmètre non vide, modération).
 */
async function hasAnnouncementSheetAccess(session: Session, churchId: string | null | undefined, userPermissions: Set<string>) {
  if (!churchId || !registry.has("planning") || !userPermissions.has("planning:view")) return false;
  const { canReadAnnouncementSheet } = await import("@/modules/planning");
  return canReadAnnouncementSheet(session, churchId);
}


/** Props de navigation passées à `AuthLayoutShell` (hors `homeHref`, `isPastoral` et `jobsUnseenCount`). */
export type NavigationProps = Omit<NavigationInput, "homeHref" | "isPastoral" | "jobsUnseenCount">;

export interface LoadedNavigation {
  readonly nav: NavigationProps;
  /** `planning:department` (ou Super Admin) : bascule vers la vue admin. */
  readonly canAccessDashboard: boolean;
  /** `planning:view` : « Mon planning », événements STAR, absences. */
  readonly hasStarPlanning: boolean;
  /** Aucune entrée de navigation disponible : parcours « aucun accès » (spec 038, CA10). */
  readonly hasAnyNavigation: boolean;
}

/** Réservations de billetterie et réponses à des formulaires du compte : un nombre, rien de plus (spec 092). */
async function myRegistrations(userId: string) {
  const [reservations, responses] = await Promise.all([
    registry.has("ticketing")
      ? import("@/modules/ticketing").then(({ countMyBookings }) => countMyBookings(userId)).catch(() => 0)
      : 0,
    registry.has("forms")
      ? import("@/modules/forms").then(({ countMemberResponses }) => countMemberResponses(userId)).catch(() => 0)
      : 0,
  ]);
  return { reservations: reservations > 0, responses: responses > 0 };
}

/**
 * Calcule la navigation de la personne connectée dans l'église courante : mêmes sections, mêmes
 * conditions et mêmes requêtes (dans le même ordre) que le layout avant l'extraction.
 */
export async function loadNavigationInput(
  session: Session,
  currentChurchId: string | null | undefined,
  isPastoral: boolean
): Promise<LoadedNavigation> {
  const churchRoles = session.user.churchRoles;
  const allDepartments = await planningDepartments(churchRoles, currentChurchId);

  const { userPermissions, canAccessDashboard } = displayPermissions(
    churchRoles,
    currentChurchId,
    session.user.isSuperAdmin,
    isPastoral
  );
  const visibleConfigLinks = configLinks(userPermissions, session.user.isSuperAdmin, currentChurchId);

  // ── Sections "Demandes" et "Médias" ────────────────────────────────────────
  const { requestLinks, mediaLinks, isProtocoleMember } = await requestAndMediaLinks(
    churchRoles,
    currentChurchId,
    userPermissions,
    session.user.isSuperAdmin,
    session.user.id
  );

  // ── Section "Intégration familles" ──────────────────────────────────────────
  const integrationNavLinks = currentChurchId
    ? await integrationLinks(churchRoles, currentChurchId, session.user.id!, userPermissions, session.user.isSuperAdmin)
    : [];

  // ── Candidatures au service (spec 077) ─────────────────────────────────────
  const servingNavLinks =
    currentChurchId && registry.has("serving")
      ? await import("@/modules/serving")
          .then(async ({ hasServingAccess }) => {
            const { servingActorFromSession } = await import("@/modules/serving/auth");
            return hasServingAccess(await servingActorFromSession(session, currentChurchId));
          })
          .then((ok) => (ok ? [{ href: paths.candidatures(), label: "Candidatures" }] : []))
          .catch(() => [])
      : [];

  // ── Section "Agenda pastoral" ────────────────────────────────────────────────
  const agendaNavLinks = await agendaLinks(session, currentChurchId, userPermissions, isProtocoleMember);

  const famillesUrl = process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

  const hasDiscipleship = userPermissions.has("discipleship:view");
  const hasAccounting = userPermissions.has("accounting:view");
  const hasAccountingManage = userPermissions.has("accounting:manage");
  const hasAccountingStats = userPermissions.has("accounting:stats");
  const hasShuttle = await isShuttleVisible(session, currentChurchId);
  const hasTreasury = await isTreasuryVisible(session, currentChurchId).catch(() => false);
  const hasTicketing = await isTicketingVisible(session, currentChurchId);
  // Formulaires : la gestion, un intervenant désigné sur un formulaire en cours (spec 079, lot 2) ou un accès délégué (spec 085).
  const hasForms =
    registry.has("forms") &&
    (userPermissions.has("forms:manage") ||
      (!!currentChurchId &&
        (((await Promise.resolve(
          prisma.formFacilitator.count({
            where: { userId: session.user.id, form: { churchId: currentChurchId, deletedAt: null, status: { not: "CLOSED" } } },
          })
        ).catch(() => 0)) ?? 0) > 0 ||
          // Accès délégué (spec 085) : ses formulaires seulement.
          ((await Promise.resolve(
            prisma.formsGrant.count({ where: { userId: session.user.id, churchId: currentChurchId } })
          ).catch(() => 0)) ?? 0) > 0)));
  // Collectes (spec 090) : gestion, gestionnaire désigné ou répondant d'une campagne sortie du brouillon.
  const hasCampaigns =
    !!currentChurchId && registry.has("campaigns")
      ? await import("@/modules/campaigns")
          .then(({ hasCampaignsSpace }) => hasCampaignsSpace(session, currentChurchId))
          .catch(() => false)
      : false;
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
  const hasAnnouncementSheet = await hasAnnouncementSheetAccess(session, currentChurchId, userPermissions);

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

  // "Mes inscriptions" (spec 092) : réservations et réponses du compte.
  const registrations = await myRegistrations(session.user.id!);

  // Spec 038 (CA10) : un utilisateur dont TOUS les rôles ne portent que sur des modules
  // désactivés sur cette instance (ex. Comptable sans le module accounting) conserve un
  // `churchRoles.length > 0` — le garde-fou de tête ne le voit donc pas. Le critère réel est
  // « aucune entrée de navigation disponible », vérifié une fois toutes les sections construites.
  // Aucun écran ni message spécifique à la désactivation n'est ajouté : c'est le même parcours
  // « aucun accès » que pour un utilisateur sans rôle du tout.
  const hasAnyNavigation =
    session.user.isSuperAdmin ||
    [visibleConfigLinks, requestLinks, mediaLinks, integrationNavLinks, servingNavLinks, agendaNavLinks].some((links) => links.length > 0) ||
    [
      hasDiscipleship, hasAccounting, hasShuttle, hasTreasury, hasTicketing, hasForms, hasCampaigns, hasJobs, hasEventsAccess, hasPlanningAccess, hasMembersAccess,
      hasReports, hasRooms, hasMyPlanning, showStarEvents, hasAbsences, hasAvailability,
    ].some(Boolean);

  return {
    nav: {
      departments: allDepartments,
      configLinks: visibleConfigLinks,
      requestLinks,
      mediaLinks,
      agendaLinks: agendaNavLinks,
      integrationLinks: integrationNavLinks,
      servingLinks: servingNavLinks,
      famillesUrl,
      hasDiscipleship,
      hasAccounting,
      hasAccountingManage,
      hasAccountingStats,
      hasShuttle,
      hasTreasury,
      hasTicketing,
      hasForms,
      hasCampaigns,
      hasJobs,
      hasEventsAccess,
      hasEventsManage,
      hasPlanningAccess,
      hasMembersAccess,
      hasReports,
      hasMyPlanning,
      showStarEvents,
      hasAnnouncementSheet,
      hasAbsences,
      hasAvailability,
      hasRooms,
      myRegistrations: registrations,
      // Actions de la palette (spec 092) : mêmes conditions que les écrans cibles.
      hasCareRequest: registry.has("care") && hasStarPlanning,
      hasAccountingSubmit: registry.has("accounting") && userPermissions.has("accounting:submit"),
    },
    canAccessDashboard,
    hasStarPlanning,
    hasAnyNavigation,
  };
}

/** Rôle principal de l'église courante (barre du bas, visite guidée) : présentation seule. */
export function currentPrimaryRole(session: Session, currentChurchId: string | null | undefined) {
  return primaryRole(session.user.churchRoles, currentChurchId, session.user.isSuperAdmin);
}
