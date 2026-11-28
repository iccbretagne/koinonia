import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildBreadcrumb, buildSpaces, parentLink, type NavigationInput } from "../navigation";
import { SCREEN_META, screenOf } from "../paths";

/** Toutes les sections ouvertes : chaque page de `(auth)` trouve son espace. */
const everything: NavigationInput = {
  departments: [{ id: "d1", name: "Son", ministryName: "Louange" }],
  configLinks: [
    { href: "/plateforme/eglises", label: "Églises" },
    { href: "/admin/ministries", label: "Ministères" },
    { href: "/admin/departments", label: "Départements" },
    { href: "/admin/departments/functions", label: "Fonctions dép." },
    { href: "/admin/salles", label: "Salles" },
    { href: "/admin/messages", label: "Messages système" },
    { href: "/admin/users", label: "Utilisateurs" },
    { href: "/admin/access", label: "Accès & rôles" },
    { href: "/admin/pastoral-profiles", label: "Profils pastoraux" },
    { href: "/finances/dons", label: "Page de dons" },
    { href: "/admin/audit-logs", label: "Historique" },
    { href: "/plateforme/backups", label: "Sauvegardes" },
    { href: "/plateforme/api", label: "API" },
    { href: "/plateforme/app-icon", label: "Icône de l'application" },
    { href: "/plateforme/site-domains", label: "Domaines des sites" },
    { href: "/plateforme/assistant", label: "Assistant" },
    { href: "/plateforme/mcp", label: "Assistants IA (MCP)" },
  ],
  requestLinks: [
    { href: "/demandes", label: "Mes demandes" },
    { href: "/demandes/traitement", label: "Traitement des demandes" },
  ],
  mediaLinks: [
    { href: "/medias", label: "Communication & Production", matchPrefixes: ["/medias", "/communication"] },
    { href: "/medias/audio", label: "Audio" },
  ],
  agendaLinks: [
    { href: "/pastoral/agenda", label: "Vue agenda" },
    { href: "/pastoral/planification", label: "Planification" },
    { href: "/pastoral/suivi", label: "Suivi pastoral" },
  ],
  integrationLinks: [
    { href: "/personnes/integration/dossiers", label: "Intégration" },
    { href: "/personnes/integration/bergers", label: "Bergers de famille" },
    { href: "/personnes/integration/parcours", label: "Parcours d'intégration" },
    { href: "/personnes/integration/stats", label: "Statistiques intégration" },
    { href: "/personnes/integration/parametres", label: "Paramètres intégration" },
  ],
  servingLinks: [{ href: "/personnes/candidatures", label: "Candidatures" }],
  hasDiscipleship: true,
  hasEventsAccess: true,
  hasEventsManage: true,
  hasPlanningAccess: true,
  hasMembersAccess: true,
  hasReports: true,
  hasMyPlanning: true,
  hasAnnouncementSheet: true,
  hasAbsences: true,
  hasAvailability: true,
  hasRooms: true,
  hasAccounting: true,
  hasAccountingManage: true,
  hasAccountingStats: true,
  hasShuttle: true,
  hasTreasury: true,
  hasTicketing: true,
  hasForms: true,
  hasCampaigns: true,
  hasJobs: true,
  homeHref: "/accueil",
};

const AUTH_DIR = path.resolve(__dirname, "../../app/(auth)");

/** Chemins réels des pages de `(auth)` : groupes `(x)` retirés, segment dynamique remplacé. */
function authPages(dir = AUTH_DIR, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === "page.tsx") out.push(prefix || "/");
      continue;
    }
    if (entry.name.startsWith("_") || entry.name === "__tests__") continue;
    const segment = /^\(.+\)$/.test(entry.name) ? "" : entry.name.startsWith("[") ? "/x1" : `/${entry.name}`;
    out.push(...authPages(path.join(dir, entry.name), prefix + segment));
  }
  return out;
}

describe("navigation — sous-pages nommées", () => {
  const spaces = buildSpaces(everything);
  const pages = authPages();

  it("aucune page de l'espace connecté n'affiche « Détail » dans le fil d'Ariane", () => {
    expect(pages.length).toBeGreaterThan(100);
    const vague = pages.filter((p) => buildBreadcrumb(spaces, p).at(-1)?.label === "Détail");
    expect(vague).toEqual([]);
  });

  it("même segment, page différente selon l'espace", () => {
    const last = (p: string) => buildBreadcrumb(spaces, p).at(-1)?.label;
    expect(last("/medias/photos/x1")).toBe("Événement");
    expect(last("/evenements/gestion/x1")).toBe("Événement");
    expect(last("/evenements/comptes-rendus/x1")).toBe("Compte rendu");
    expect(last("/evenements")).toBe("Calendrier de l'église");
    expect(last("/planning/disponibilites/collectes")).toBe("Collectes de disponibilités");
    expect(last("/demandes/questionnaires/x1")).toBe("Campagne");
    expect(last("/demandes/rendez-vous")).toBe("Demander un rendez-vous");
    expect(last("/pastoral/suivi/rendez-vous/x1")).toBe("Demande de rendez-vous");
    expect(last("/evenements/billetterie/x1/controle")).toBe("Contrôle d'entrée");
    expect(last("/profile/assistants")).toBe("Assistants connectés");
    expect(last("/ressources/salles/checklists")).toBe("Contrôle des mains courantes");
  });

  it("sous-pages nommées par leur objet : détails, créations, pages hors espace", () => {
    const last = (p: string, dept: string | null = null) => buildBreadcrumb(spaces, p, dept).at(-1)?.label;
    expect(last("/finances/demandes/x1")).toBe("Demande comptable");
    expect(last("/finances/demandes/nouvelle")).toBe("Nouvelle demande comptable");
    expect(last("/demandes/nouvelle")).toBe("Nouvelle demande");
    expect(last("/admin/messages/nouveau")).toBe("Nouveau message");
    expect(last("/admin/messages/x1")).toBe("Message");
    expect(last("/admin/users/nouveau")).toBe("Nouvel utilisateur");
    expect(last("/admin/access/users/x1")).toBe("Utilisateur");
    expect(last("/admin/eglise/x1")).toBe("Paramètres de l'église");
    expect(last("/finances/dons/slide")).toBe("Slide de projection");
    expect(last("/pastoral/planification")).toBe("Planification");
    expect(last("/pastoral/agenda/nouveau")).toBe("Nouvelle entrée");
    expect(last("/pastoral/agenda/x1")).toBe("Profil pastoral");
    expect(last("/personnes/candidatures/entretiens")).toBe("Entretiens");
    expect(last("/profile/candidature")).toBe("Ma fiche");
    expect(last("/evenements/mes-inscriptions?vue=formulaires")).toBe("Mes inscriptions");
    expect(last("/evenements/billetterie/x1/badges")).toBe("Badges");
    expect(last("/evenements/billetterie/x1/images")).toBe("Images du site");
    expect(last("/evenements/mes-inscriptions")).toBe("Mes inscriptions");
    expect(last("/medias/photos/nouveau")).toBe("Nouvel événement");
    expect(last("/ressources/offres/freelance/missions/nouveau")).toBe("Nouvelle mission");
    expect(last("/messages/x1")).toBe("Message de l'administration");
    expect(last("/mcp/autoriser")).toBe("Connecter un assistant IA");
    expect(buildBreadcrumb(spaces, "/planning/departements/statistiques", "d1").map((c) => c.label)).toEqual(["Planning", "Louange", "Son", "Statistiques du département"]);
    expect(buildBreadcrumb(spaces, "/planning/departements", "d1").at(-1)?.label).toBe("Son");
  });

  it("chaque page connectée hors redirection a un fil d'Ariane", () => {
    const redirects = ["/planning/disponibilites/equipe", "/admin", "/finances", "/personnes", "/plateforme", "/ressources"];
    const pastoral = (p: string) => p === "/pastoral" || p.startsWith("/pastoral/") || p === "/personnes/mes-membres";
    const empty = pages.filter((p) => !redirects.includes(p) && !pastoral(p) && buildBreadcrumb(spaces, p).length === 0);
    expect(empty).toEqual([]);
  });

  it("un STAR : l'agenda de l'église est sa page d'espace, ses sous-pages de profil sont nommées", () => {
    const star = buildSpaces({
      departments: [],
      configLinks: [],
      requestLinks: [],
      mediaLinks: [],
      hasMyPlanning: true,
      showStarEvents: true,
      hasAvailability: true,
      homeHref: "/accueil",
    });
    expect(buildBreadcrumb(star, "/evenements").map((c) => c.label)).toEqual(["Calendrier de l'église"]);
    expect(buildBreadcrumb(star, "/profile/assistants").map((c) => c.label)).toEqual(["Mon profil", "Assistants connectés"]);
  });

  it("retour mobile : toute page qui n'est pas une page de navigation a un chevron, même hors des espaces du rôle", () => {
    const star = buildSpaces({ departments: [], configLinks: [], requestLinks: [], mediaLinks: [], hasMyPlanning: true, showStarEvents: true, homeHref: "/accueil" });
    for (const sp of [spaces, star]) {
      const navHrefs = new Set(sp.flatMap((s) => s.pages).map((p) => p.href.split("?")[0]));
      // Pages de premier niveau d'un autre rôle (hors de ses espaces) et pages de compte : pas de retour.
    const topLevel = ["/accueil", "/planning/disponibilites/equipe", "/admin", "/ressources/offres", "/pastoral", "/planning/departements", "/finances/statistiques", "/evenements"];
    // Un écran sans parent dans le registre est une page d'espace d'un autre rôle : pas de retour.
    const hasParent = (p: string) => {
      const ref = screenOf(p);
      return !ref || SCREEN_META[ref.key].parent !== null || SCREEN_META[ref.key].orHome === true;
    };
    const missing = pages.filter((p) => !navHrefs.has(p) && !topLevel.includes(p) && hasParent(p) && !parentLink(sp, p, "d1"));
      expect(missing).toEqual([]);
    }
    expect(parentLink(star, "/messages/x1")).toEqual({ href: "/accueil", label: "Accueil" });
    expect(parentLink(star, "/mcp/autoriser")).toEqual({ href: "/accueil", label: "Accueil" });
    expect(parentLink(star, "/personnes/mes-membres")).toEqual({ href: "/accueil", label: "Accueil" });
    // Sans l'espace Questionnaires : retour à l'Accueil, d'où le questionnaire est proposé.
    expect(parentLink(star, "/demandes/questionnaires/r/x1")).toEqual({ href: "/accueil", label: "Accueil" });
    expect(parentLink(star, "/profile")).toEqual({ href: "/accueil", label: "Accueil" });
    expect(parentLink(star, "/guide")).toEqual({ href: "/accueil", label: "Accueil" });
    expect(parentLink(spaces, "/demandes/questionnaires/r/x1")).toEqual({ href: "/demandes/questionnaires", label: "Questionnaires" });
  });
});
