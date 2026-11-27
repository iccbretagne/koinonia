/**
 * Registre unique des écrans connectés (spec 092, ADR-0033).
 *
 * Chaque page de `src/app/(auth)` a une clé et un motif d'adresse (`SCREENS`), et un
 * constructeur typé (`paths`). Tout lien interne — pages, composants, services qui écrivent des
 * liens de notification, assistant, MCP, emails — construit ses adresses ici : la bascule des
 * adresses (lot 4) changera ce fichier, pas les centaines de sites d'appel. Un test à cliquet
 * (`no-screen-literals.test.ts`) refuse tout nouveau littéral d'écran ailleurs.
 *
 * Module **pur** (aucun import) : lisible par le proxy, les composants client et les modules.
 *
 * Sécurité : un constructeur encode chaque segment dynamique (`encodeURIComponent`) et chaque
 * paramètre de requête (`URLSearchParams`) — un identifiant ne peut injecter ni segment, ni
 * requête, ni origine dans un lien. Une adresse construite commence toujours par `/` suivi d'un
 * segment statique : jamais `//`, donc jamais une autre origine.
 */

/** Paramètres de requête ; `null`/`undefined`/`false` sont omis. */
export type Query = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** Motif d'adresse de chaque écran, tel que le routeur le sert (groupes de routes retirés). */
export const SCREENS = {
  absences: "/absences",
  "accounting.navette": "/accounting/navette",
  "accounting.requests": "/accounting/requests",
  "accounting.request": "/accounting/requests/[id]",
  "accounting.newRequest": "/accounting/requests/new",
  "accounting.stats": "/accounting/stats",
  "accounting.tresorerie": "/accounting/tresorerie",
  accueil: "/accueil",
  admin: "/admin",
  "admin.access": "/admin/access",
  "admin.accessRole": "/admin/access/roles/[role]",
  "admin.accessUser": "/admin/access/users/[userId]",
  "admin.api": "/admin/api",
  "admin.appIcon": "/admin/app-icon",
  "admin.assistant": "/admin/assistant",
  "admin.auditLogs": "/admin/audit-logs",
  "admin.backups": "/admin/backups",
  "admin.churches": "/admin/churches",
  "admin.church": "/admin/churches/[churchId]",
  "admin.onboardChurch": "/admin/churches/onboard",
  "admin.departments": "/admin/departments",
  "admin.departmentFunctions": "/admin/departments/functions",
  "admin.discipleship": "/admin/discipleship",
  "admin.events": "/admin/events",
  "admin.event": "/admin/events/[eventId]",
  "admin.eventReport": "/admin/events/[eventId]/report",
  "admin.jobs": "/admin/jobs",
  "admin.mcp": "/admin/mcp",
  "admin.members": "/admin/members",
  "admin.memberDuplicates": "/admin/members/duplicates",
  "admin.messages": "/admin/messages",
  "admin.message": "/admin/messages/[id]",
  "admin.newMessage": "/admin/messages/new",
  "admin.ministries": "/admin/ministries",
  "admin.pastoralProfiles": "/admin/pastoral-profiles",
  "admin.reports": "/admin/reports",
  "admin.rooms": "/admin/rooms",
  "admin.siteDomains": "/admin/site-domains",
  "admin.users": "/admin/users",
  "admin.newUser": "/admin/users/new",
  "admin.welcomeDuty": "/admin/welcome-duty",
  agenda: "/agenda",
  "agenda.profile": "/agenda/[profileId]",
  "agenda.newEntry": "/agenda/new",
  "agenda.schedule": "/agenda/schedule",
  audio: "/audio",
  "audio.ecouter": "/audio/ecouter",
  "audio.ecouterService": "/audio/ecouter/[id]",
  "audio.parametres": "/audio/parametres",
  "audio.production": "/audio/production",
  "audio.productionService": "/audio/production/[id]",
  billetterie: "/billetterie",
  "billetterie.event": "/billetterie/[id]",
  "billetterie.badges": "/billetterie/[id]/badges",
  "billetterie.controle": "/billetterie/[id]/controle",
  "billetterie.etiquettes": "/billetterie/[id]/etiquettes",
  "billetterie.images": "/billetterie/[id]/images",
  "billetterie.restauration": "/billetterie/[id]/restauration",
  "billetterie.mesReservations": "/billetterie/mes-reservations",
  candidatures: "/candidatures",
  "candidatures.application": "/candidatures/[id]",
  "candidatures.entretiens": "/candidatures/entretiens",
  "candidatures.maFiche": "/candidatures/ma-fiche",
  "candidatures.parametres": "/candidatures/parametres",
  care: "/care",
  "care.followup": "/care/followups/[id]",
  "care.parametres": "/care/parametres",
  "care.request": "/care/request",
  "care.requestDetail": "/care/requests/[id]",
  "care.stats": "/care/stats",
  collectes: "/collectes",
  "collectes.campaign": "/collectes/[id]",
  "collectes.apercu": "/collectes/[id]/apercu/[formId]",
  "collectes.editer": "/collectes/[id]/editer",
  "collectes.importInto": "/collectes/[id]/import",
  "collectes.importNew": "/collectes/import",
  "collectes.nouvelle": "/collectes/nouvelle",
  "collectes.reponse": "/collectes/r/[assignmentId]",
  "communication.requests": "/communication/requests",
  dashboard: "/dashboard",
  "dashboard.stats": "/dashboard/stats",
  disponibilites: "/disponibilites",
  "disponibilites.collectes": "/disponibilites/collectes",
  "disponibilites.parametres": "/disponibilites/parametres",
  dons: "/dons",
  "dons.slide": "/dons/slide",
  events: "/events",
  "events.starView": "/events/[eventId]/star-view",
  "events.announcementSheets": "/events/announcement-sheets",
  "events.calendar": "/events/calendar",
  formulaires: "/formulaires",
  "formulaires.form": "/formulaires/[id]",
  "formulaires.mesReponses": "/formulaires/mes-reponses",
  guide: "/guide",
  "integration.leaders": "/integration/leaders",
  "integration.parametres": "/integration/parametres",
  "integration.parcours": "/integration/parcours",
  "integration.requests": "/integration/requests",
  "integration.request": "/integration/requests/[id]",
  "integration.stats": "/integration/stats",
  jobs: "/jobs",
  "jobs.offer": "/jobs/[id]",
  "jobs.editOffer": "/jobs/[id]/edit",
  "jobs.mission": "/jobs/freelance/missions/[id]",
  "jobs.editMission": "/jobs/freelance/missions/[id]/edit",
  "jobs.newMission": "/jobs/freelance/missions/new",
  "jobs.freelanceProfile": "/jobs/freelance/profiles/[id]",
  "jobs.editFreelanceProfile": "/jobs/freelance/profiles/[id]/edit",
  "jobs.newFreelanceProfile": "/jobs/freelance/profiles/new",
  "jobs.newOffer": "/jobs/new",
  "jobs.seeker": "/jobs/seekers/[id]",
  "jobs.editSeeker": "/jobs/seekers/[id]/edit",
  "jobs.newSeeker": "/jobs/seekers/new",
  "mcp.autoriser": "/mcp/autoriser",
  media: "/media",
  "media.projects": "/media/projects",
  "media.project": "/media/projects/[id]",
  "media.newProject": "/media/projects/new",
  "media.requests": "/media/requests",
  "media.collections": "/media/collections",
  "media.events": "/media/events",
  "media.event": "/media/events/[id]",
  "media.newEvent": "/media/events/new",
  "media.galerie": "/media/galerie",
  "messages.message": "/messages/[id]",
  pastoral: "/pastoral",
  "pastoral.accounting": "/pastoral/accounting",
  "pastoral.events": "/pastoral/events",
  "pastoral.members": "/pastoral/members",
  "pastoral.reports": "/pastoral/reports",
  planning: "/planning",
  "planning.events": "/planning/events",
  "planning.remplacement": "/planning/remplacements/[id]",
  profile: "/profile",
  "profile.assistants": "/profile/assistants",
  "profile.notifications": "/profile/notifications",
  requests: "/requests",
  "requests.edit": "/requests/[id]/edit",
  "requests.newRequest": "/requests/new",
  rooms: "/rooms",
  "rooms.checklists": "/rooms/checklists",
  "secretariat.requests": "/secretariat/requests",
} as const;

export type ScreenKey = keyof typeof SCREENS;

/* ── Parenté et libellés (spec 092, lot 1) ───────────────────────────────────── */

/** Espaces de la navigation (ADR-0033) ; `account` = hors espaces (profil, guide, messages). */
export type SpaceId =
  | "home"
  | "planning"
  | "events"
  | "pastoral"
  | "people"
  | "requests"
  | "finances"
  | "media"
  | "resources"
  | "admin"
  | "platform"
  | "account";

export interface ScreenMeta {
  /** Espace où l'écran se range. */
  readonly space: SpaceId;
  /**
   * Parent réel : l'écran où ramène le retour mobile et que nomme le fil d'Ariane. `null` : page
   * d'espace (ou page racine). Une liste donne des alternatives selon l'entrée de navigation que
   * la personne possède (la première présente dans sa navigation l'emporte).
   */
  readonly parent: ScreenKey | readonly ScreenKey[] | null;
  /** Libellé de l'écran dans le fil d'Ariane (et dans la navigation pour une page d'espace). */
  readonly label: string;
  /** Repli sur l'Accueil quand aucun parent n'est dans la navigation de la personne. */
  readonly orHome?: boolean;
}

const m = (space: SpaceId, parent: ScreenMeta["parent"], label: string, orHome?: boolean): ScreenMeta =>
  orHome ? { space, parent, label, orHome } : { space, parent, label };

/**
 * Espace, parent et libellé de chaque écran. Aucun écran n'a l'Accueil pour parent par défaut :
 * `paths.test.ts` vérifie que chaque chaîne de parents aboutit à une page racine, sans cycle.
 */
export const SCREEN_META: Record<ScreenKey, ScreenMeta> = {
  absences: m("planning", "disponibilites", "Indisponibilités de l'équipe"),
  "accounting.navette": m("finances", null, "Navette"),
  "accounting.requests": m("finances", "requests", "Demandes comptables"),
  "accounting.request": m("finances", "accounting.requests", "Demande comptable"),
  "accounting.newRequest": m("finances", "accounting.requests", "Nouvelle demande comptable"),
  "accounting.stats": m("finances", null, "Statistiques"),
  "accounting.tresorerie": m("finances", null, "Trésorerie"),
  accueil: m("home", null, "Accueil"),
  admin: m("admin", null, "Administration"),
  "admin.access": m("admin", null, "Accès & rôles"),
  "admin.accessRole": m("admin", "admin.access", "Rôle"),
  "admin.accessUser": m("admin", "admin.access", "Utilisateur"),
  "admin.api": m("platform", null, "API"),
  "admin.appIcon": m("platform", null, "Icône de l'application"),
  "admin.assistant": m("platform", null, "Assistant"),
  "admin.auditLogs": m("admin", null, "Historique"),
  "admin.backups": m("platform", null, "Sauvegardes"),
  "admin.churches": m("platform", null, "Églises"),
  "admin.church": m("admin", "admin.churches", "Paramètres de l'église"),
  "admin.onboardChurch": m("platform", "admin.churches", "Nouvelle église"),
  "admin.departments": m("admin", null, "Départements"),
  "admin.departmentFunctions": m("admin", null, "Fonctions des départements"),
  "admin.discipleship": m("people", null, "Discipolat"),
  "admin.events": m("events", null, "Gérer les événements"),
  "admin.event": m("events", "admin.events", "Événement"),
  "admin.eventReport": m("events", ["admin.reports", "admin.event"], "Compte rendu"),
  "admin.jobs": m("resources", "jobs", "Gestion des offres"),
  "admin.mcp": m("platform", null, "Assistants IA"),
  "admin.members": m("people", null, "STAR"),
  "admin.memberDuplicates": m("people", "admin.members", "Doublons"),
  "admin.messages": m("admin", null, "Messages système"),
  "admin.message": m("admin", "admin.messages", "Message"),
  "admin.newMessage": m("admin", "admin.messages", "Nouveau message"),
  "admin.ministries": m("admin", null, "Ministères"),
  "admin.pastoralProfiles": m("admin", null, "Profils pastoraux"),
  "admin.reports": m("events", null, "Comptes rendus"),
  "admin.rooms": m("admin", null, "Configuration des salles"),
  "admin.siteDomains": m("platform", null, "Domaines des sites"),
  "admin.users": m("admin", null, "Utilisateurs"),
  "admin.newUser": m("admin", "admin.users", "Nouvel utilisateur"),
  "admin.welcomeDuty": m("events", null, "Service d'accueil"),
  agenda: m("pastoral", null, "Agenda des pasteurs"),
  "agenda.profile": m("pastoral", "agenda", "Profil pastoral"),
  "agenda.newEntry": m("pastoral", "agenda", "Nouvelle entrée"),
  "agenda.schedule": m("pastoral", null, "Planification"),
  audio: m("media", null, "Audio"),
  "audio.ecouter": m("media", "audio", "(re)Écouter"),
  "audio.ecouterService": m("media", "audio.ecouter", "Culte"),
  "audio.parametres": m("media", "audio", "Paramètres"),
  "audio.production": m("media", "audio", "Production"),
  "audio.productionService": m("media", "audio.production", "Culte"),
  billetterie: m("events", null, "Billetterie"),
  "billetterie.event": m("events", "billetterie", "Événement"),
  "billetterie.badges": m("events", "billetterie.event", "Badges"),
  "billetterie.controle": m("events", "billetterie.event", "Contrôle d'entrée"),
  "billetterie.etiquettes": m("events", "billetterie.event", "Étiquettes"),
  "billetterie.images": m("events", "billetterie.event", "Images du site"),
  "billetterie.restauration": m("events", "billetterie.event", "Restauration"),
  "billetterie.mesReservations": m("events", "requests", "Mes réservations", true),
  candidatures: m("people", null, "Candidatures"),
  "candidatures.application": m("people", "candidatures", "Candidature"),
  "candidatures.entretiens": m("people", "candidatures", "Entretiens"),
  "candidatures.maFiche": m("account", "profile", "Ma fiche"),
  "candidatures.parametres": m("people", "candidatures", "Paramètres"),
  care: m("pastoral", null, "Suivi pastoral"),
  "care.followup": m("pastoral", "care", "Suivi"),
  "care.parametres": m("pastoral", "care", "Paramètres"),
  "care.request": m("requests", "requests", "Demander un rendez-vous"),
  "care.requestDetail": m("pastoral", "care", "Demande de rendez-vous"),
  "care.stats": m("pastoral", "care", "Statistiques"),
  collectes: m("requests", null, "Questionnaires"),
  "collectes.campaign": m("requests", "collectes", "Campagne"),
  "collectes.apercu": m("requests", "collectes.campaign", "Aperçu"),
  "collectes.editer": m("requests", "collectes.campaign", "Modification"),
  "collectes.importInto": m("requests", "collectes.campaign", "Import"),
  "collectes.importNew": m("requests", "collectes", "Import"),
  "collectes.nouvelle": m("requests", "collectes", "Nouvelle campagne"),
  "collectes.reponse": m("requests", "collectes", "Contribution"),
  "communication.requests": m("media", "media", "Réseaux sociaux"),
  dashboard: m("planning", null, "Planning"),
  "dashboard.stats": m("planning", "dashboard", "Statistiques du département"),
  disponibilites: m("planning", null, "Disponibilités"),
  "disponibilites.collectes": m("planning", "disponibilites", "Collectes de disponibilités"),
  "disponibilites.parametres": m("planning", "disponibilites", "Paramètres"),
  dons: m("finances", null, "Page de dons"),
  "dons.slide": m("finances", "dons", "Slide de projection"),
  events: m("events", null, "Calendrier de l'église"),
  "events.starView": m("events", ["events", "planning.events"], "Planning des STAR"),
  "events.announcementSheets": m("events", null, "Trame des annonces"),
  "events.calendar": m("events", "events", "Vue calendrier"),
  formulaires: m("events", null, "Formulaires"),
  "formulaires.form": m("events", "formulaires", "Formulaire"),
  "formulaires.mesReponses": m("events", "requests", "Mes réponses", true),
  guide: m("account", null, "Guide d'utilisation"),
  "integration.leaders": m("people", null, "Bergers de famille"),
  "integration.parametres": m("people", null, "Paramètres intégration"),
  "integration.parcours": m("people", null, "Parcours d'intégration"),
  "integration.requests": m("people", null, "Dossiers d'intégration"),
  "integration.request": m("people", "integration.requests", "Dossier d'intégration"),
  "integration.stats": m("people", null, "Statistiques intégration"),
  jobs: m("resources", null, "Offres"),
  "jobs.offer": m("resources", "jobs", "Offre"),
  "jobs.editOffer": m("resources", "jobs.offer", "Modification"),
  "jobs.mission": m("resources", "jobs", "Mission"),
  "jobs.editMission": m("resources", "jobs.mission", "Modification"),
  "jobs.newMission": m("resources", "jobs", "Nouvelle mission"),
  "jobs.freelanceProfile": m("resources", "jobs", "Profil freelance"),
  "jobs.editFreelanceProfile": m("resources", "jobs.freelanceProfile", "Modification"),
  "jobs.newFreelanceProfile": m("resources", "jobs", "Nouveau profil freelance"),
  "jobs.newOffer": m("resources", "jobs", "Nouvelle offre"),
  "jobs.seeker": m("resources", "jobs", "Recherche d'emploi"),
  "jobs.editSeeker": m("resources", "jobs.seeker", "Modification"),
  "jobs.newSeeker": m("resources", "jobs", "Nouvelle recherche d'emploi"),
  "mcp.autoriser": m("account", null, "Connecter un assistant IA", true),
  media: m("media", null, "Communication & Production"),
  "media.projects": m("media", "media", "Projets"),
  "media.project": m("media", "media.projects", "Projet"),
  "media.newProject": m("media", "media.projects", "Nouveau projet"),
  "media.requests": m("media", "media", "Demandes de visuels"),
  "media.collections": m("media", "media", "Partages"),
  "media.events": m("media", "media", "Photos"),
  "media.event": m("media", "media.events", "Événement"),
  "media.newEvent": m("media", "media.events", "Nouvel événement"),
  "media.galerie": m("media", "media", "Galerie"),
  "messages.message": m("account", "admin.messages", "Message de l'administration", true),
  pastoral: m("pastoral", null, "Pastoral"),
  "pastoral.accounting": m("finances", null, "Demandes comptables"),
  "pastoral.events": m("events", null, "Événements pastoraux"),
  "pastoral.members": m("people", null, "Mes membres"),
  "pastoral.reports": m("events", null, "Comptes rendus"),
  planning: m("planning", null, "Mon planning"),
  "planning.events": m("events", null, "Calendrier de l'église"),
  "planning.remplacement": m("planning", "planning", "Remplacement"),
  profile: m("account", null, "Mon profil"),
  "profile.assistants": m("account", "profile", "Assistants connectés"),
  "profile.notifications": m("account", "profile", "Notifications"),
  requests: m("requests", null, "Mes demandes"),
  "requests.edit": m("requests", "requests", "Modification"),
  "requests.newRequest": m("requests", "requests", "Nouvelle demande"),
  rooms: m("resources", null, "Salles"),
  "rooms.checklists": m("resources", "rooms", "Contrôle des mains courantes"),
  "secretariat.requests": m("requests", null, "Traitement des demandes"),
};

/** Motif d'un écran en expression régulière (segments `[param]` = un segment non vide). */
function patternOf(key: ScreenKey): RegExp {
  const source = SCREENS[key]
    .split("/")
    .map((seg) => (/^\[[^\]]+\]$/.test(seg) ? "([^/]+)" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}/?$`);
}

const MATCHERS = (Object.keys(SCREENS) as ScreenKey[])
  .map((key) => ({
    key,
    regex: patternOf(key),
    // Écran le plus spécifique d'abord : `/admin/members/duplicates` avant `/admin/members/[x]`.
    statics: SCREENS[key].split("/").filter((seg) => seg && !seg.startsWith("[")).length,
    names: [...SCREENS[key].matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]),
  }))
  .sort((a, b) => b.statics - a.statics);

/** Écran d'une adresse (sans requête) et valeurs décodées de ses segments dynamiques, ou `null`. */
export function screenOf(pathname: string): { key: ScreenKey; params: Record<string, string> } | null {
  const path = pathname.split(/[?#]/)[0];
  for (const { key, regex, names } of MATCHERS) {
    const found = regex.exec(path);
    if (!found) continue;
    const params: Record<string, string> = {};
    names.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(found[i + 1]);
      } catch {
        params[name] = found[i + 1];
      }
    });
    return { key, params };
  }
  return null;
}

/** Adresse d'un écran dont les segments dynamiques viennent de `params` (par nom), ou `null` s'il en manque. */
export function screenPath(key: ScreenKey, params: Readonly<Record<string, string>>): string | null {
  let missing = false;
  const path = SCREENS[key].replace(/\[([^\]]+)\]/g, (_, name: string) => {
    if (params[name] === undefined) {
      missing = true;
      return "";
    }
    return segment(params[name]);
  });
  return missing ? null : path;
}

/**
 * Préfixes d'adresse qui ne sont pas eux-mêmes un écran (correspondance de navigation, écrans
 * d'aide de l'assistant) : segments partagés par plusieurs écrans, ou parent d'un écran détail.
 */
export const PREFIXES = {
  accounting: "/accounting",
  communication: "/communication",
  integration: "/integration",
  mcp: "/mcp",
  messages: "/messages",
  planningRemplacements: "/planning/remplacements",
  secretariat: "/secretariat",
} as const;

/**
 * Encode un segment dynamique. Ne lève jamais : un lien se construit souvent dans une
 * notification ou une transaction, qu'un identifiant inattendu ne doit pas faire échouer (le
 * lien mène alors à un 404, comme avant ce registre). `/`, `?` et `#` sont encodés : un
 * identifiant ne sort jamais de son segment.
 */
function segment(value: string): string {
  return encodeURIComponent(String(value));
}

function search(query: Query | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === false) continue;
    params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Remplit les segments `[param]` du motif, dans l'ordre, puis ajoute la requête. */
function build(key: ScreenKey, args: readonly string[], query?: Query): string {
  let i = 0;
  const path = SCREENS[key].replace(/\[[^\]]+\]/g, () => segment(args[i++]));
  return path + search(query);
}

const s0 = (key: ScreenKey) => (query?: Query) => build(key, [], query);
const s1 = (key: ScreenKey) => (a: string, query?: Query) => build(key, [a], query);
const s2 = (key: ScreenKey) => (a: string, b: string, query?: Query) => build(key, [a, b], query);

/** Constructeurs typés, un par écran — `paths.accounting.request(id)`, `paths.dashboard({ dept })`. */
export const paths = {
  absences: s0("absences"),
  accounting: {
    navette: s0("accounting.navette"),
    requests: s0("accounting.requests"),
    request: s1("accounting.request"),
    newRequest: s0("accounting.newRequest"),
    stats: s0("accounting.stats"),
    tresorerie: s0("accounting.tresorerie"),
  },
  accueil: s0("accueil"),
  admin: Object.assign(s0("admin"), {
    access: s0("admin.access"),
    accessRole: s1("admin.accessRole"),
    accessUser: s1("admin.accessUser"),
    api: s0("admin.api"),
    appIcon: s0("admin.appIcon"),
    assistant: s0("admin.assistant"),
    auditLogs: s0("admin.auditLogs"),
    backups: s0("admin.backups"),
    churches: s0("admin.churches"),
    church: s1("admin.church"),
    onboardChurch: s0("admin.onboardChurch"),
    departments: s0("admin.departments"),
    departmentFunctions: s0("admin.departmentFunctions"),
    discipleship: s0("admin.discipleship"),
    events: s0("admin.events"),
    event: s1("admin.event"),
    eventReport: s1("admin.eventReport"),
    jobs: s0("admin.jobs"),
    mcp: s0("admin.mcp"),
    members: s0("admin.members"),
    memberDuplicates: s0("admin.memberDuplicates"),
    messages: s0("admin.messages"),
    message: s1("admin.message"),
    newMessage: s0("admin.newMessage"),
    ministries: s0("admin.ministries"),
    pastoralProfiles: s0("admin.pastoralProfiles"),
    reports: s0("admin.reports"),
    rooms: s0("admin.rooms"),
    siteDomains: s0("admin.siteDomains"),
    users: s0("admin.users"),
    newUser: s0("admin.newUser"),
    welcomeDuty: s0("admin.welcomeDuty"),
  }),
  agenda: Object.assign(s0("agenda"), {
    profile: s1("agenda.profile"),
    newEntry: s0("agenda.newEntry"),
    schedule: s0("agenda.schedule"),
  }),
  audio: Object.assign(s0("audio"), {
    ecouter: s0("audio.ecouter"),
    ecouterService: s1("audio.ecouterService"),
    parametres: s0("audio.parametres"),
    production: s0("audio.production"),
    productionService: s1("audio.productionService"),
  }),
  billetterie: Object.assign(s0("billetterie"), {
    event: s1("billetterie.event"),
    badges: s1("billetterie.badges"),
    controle: s1("billetterie.controle"),
    etiquettes: s1("billetterie.etiquettes"),
    images: s1("billetterie.images"),
    restauration: s1("billetterie.restauration"),
    mesReservations: s0("billetterie.mesReservations"),
  }),
  candidatures: Object.assign(s0("candidatures"), {
    application: s1("candidatures.application"),
    entretiens: s0("candidatures.entretiens"),
    maFiche: s0("candidatures.maFiche"),
    parametres: s0("candidatures.parametres"),
  }),
  care: Object.assign(s0("care"), {
    followup: s1("care.followup"),
    parametres: s0("care.parametres"),
    request: s0("care.request"),
    requestDetail: s1("care.requestDetail"),
    stats: s0("care.stats"),
  }),
  collectes: Object.assign(s0("collectes"), {
    campaign: s1("collectes.campaign"),
    apercu: s2("collectes.apercu"),
    editer: s1("collectes.editer"),
    importInto: s1("collectes.importInto"),
    importNew: s0("collectes.importNew"),
    nouvelle: s0("collectes.nouvelle"),
    reponse: s1("collectes.reponse"),
  }),
  communication: {
    requests: s0("communication.requests"),
  },
  dashboard: Object.assign(s0("dashboard"), {
    stats: s0("dashboard.stats"),
  }),
  disponibilites: Object.assign(s0("disponibilites"), {
    collectes: s0("disponibilites.collectes"),
    parametres: s0("disponibilites.parametres"),
  }),
  dons: Object.assign(s0("dons"), {
    slide: s0("dons.slide"),
  }),
  events: Object.assign(s0("events"), {
    starView: s1("events.starView"),
    announcementSheets: s0("events.announcementSheets"),
    calendar: s0("events.calendar"),
  }),
  formulaires: Object.assign(s0("formulaires"), {
    form: s1("formulaires.form"),
    mesReponses: s0("formulaires.mesReponses"),
  }),
  guide: s0("guide"),
  integration: {
    leaders: s0("integration.leaders"),
    parametres: s0("integration.parametres"),
    parcours: s0("integration.parcours"),
    requests: s0("integration.requests"),
    request: s1("integration.request"),
    stats: s0("integration.stats"),
  },
  jobs: Object.assign(s0("jobs"), {
    offer: s1("jobs.offer"),
    editOffer: s1("jobs.editOffer"),
    mission: s1("jobs.mission"),
    editMission: s1("jobs.editMission"),
    newMission: s0("jobs.newMission"),
    freelanceProfile: s1("jobs.freelanceProfile"),
    editFreelanceProfile: s1("jobs.editFreelanceProfile"),
    newFreelanceProfile: s0("jobs.newFreelanceProfile"),
    newOffer: s0("jobs.newOffer"),
    seeker: s1("jobs.seeker"),
    editSeeker: s1("jobs.editSeeker"),
    newSeeker: s0("jobs.newSeeker"),
  }),
  mcp: {
    autoriser: s0("mcp.autoriser"),
  },
  media: Object.assign(s0("media"), {
    projects: s0("media.projects"),
    project: s1("media.project"),
    newProject: s0("media.newProject"),
    requests: s0("media.requests"),
    collections: s0("media.collections"),
    events: s0("media.events"),
    event: s1("media.event"),
    newEvent: s0("media.newEvent"),
    galerie: s0("media.galerie"),
  }),
  messages: {
    message: s1("messages.message"),
  },
  pastoral: Object.assign(s0("pastoral"), {
    accounting: s0("pastoral.accounting"),
    events: s0("pastoral.events"),
    members: s0("pastoral.members"),
    reports: s0("pastoral.reports"),
  }),
  planning: Object.assign(s0("planning"), {
    events: s0("planning.events"),
    remplacement: s1("planning.remplacement"),
  }),
  profile: Object.assign(s0("profile"), {
    assistants: s0("profile.assistants"),
    notifications: s0("profile.notifications"),
  }),
  requests: Object.assign(s0("requests"), {
    edit: s1("requests.edit"),
    newRequest: s0("requests.newRequest"),
  }),
  rooms: Object.assign(s0("rooms"), {
    checklists: s0("rooms.checklists"),
  }),
  secretariat: {
    requests: s0("secretariat.requests"),
  },
} as const;
