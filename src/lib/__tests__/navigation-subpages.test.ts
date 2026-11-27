import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildBreadcrumb, buildSpaces, type NavigationInput } from "../navigation";

/** Toutes les sections ouvertes : chaque page de `(auth)` trouve son espace. */
const everything: NavigationInput = {
  departments: [{ id: "d1", name: "Son", ministryName: "Louange" }],
  configLinks: [
    { href: "/admin/churches", label: "Églises" },
    { href: "/admin/ministries", label: "Ministères" },
    { href: "/admin/departments", label: "Départements" },
    { href: "/admin/departments/functions", label: "Fonctions dép." },
    { href: "/admin/rooms", label: "Salles" },
    { href: "/admin/messages", label: "Messages système" },
    { href: "/admin/users", label: "Utilisateurs" },
    { href: "/admin/access", label: "Accès & rôles" },
    { href: "/admin/pastoral-profiles", label: "Profils pastoraux" },
    { href: "/dons", label: "Page de dons" },
    { href: "/admin/audit-logs", label: "Historique" },
    { href: "/admin/backups", label: "Sauvegardes" },
    { href: "/admin/api", label: "API" },
    { href: "/admin/app-icon", label: "Icône de l'application" },
    { href: "/admin/site-domains", label: "Domaines des sites" },
    { href: "/admin/assistant", label: "Assistant" },
    { href: "/admin/mcp", label: "Assistants IA (MCP)" },
  ],
  requestLinks: [
    { href: "/requests", label: "Mes demandes" },
    { href: "/secretariat/requests", label: "Traitement des demandes" },
  ],
  mediaLinks: [
    { href: "/media", label: "Communication & Production", matchPrefixes: ["/media", "/communication"] },
    { href: "/audio", label: "Audio" },
  ],
  agendaLinks: [
    { href: "/agenda", label: "Vue agenda" },
    { href: "/agenda/schedule", label: "Planification" },
    { href: "/care", label: "Suivi pastoral" },
  ],
  integrationLinks: [
    { href: "/integration/requests", label: "Intégration" },
    { href: "/integration/leaders", label: "Bergers de famille" },
    { href: "/integration/parcours", label: "Parcours d'intégration" },
    { href: "/integration/stats", label: "Statistiques intégration" },
    { href: "/integration/parametres", label: "Paramètres intégration" },
  ],
  servingLinks: [{ href: "/candidatures", label: "Candidatures" }],
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
    expect(last("/media/events/x1")).toBe("Événement");
    expect(last("/admin/events/x1")).toBe("Événement");
    expect(last("/admin/events/x1/report")).toBe("Compte rendu");
    expect(last("/planning/events")).toBe("Agenda de l'église");
    expect(last("/disponibilites/collectes")).toBe("Collectes");
    expect(last("/collectes/x1")).toBe("Campagne");
    expect(last("/care/request")).toBe("Demande de RDV");
    expect(last("/care/requests/x1")).toBe("Demande");
    expect(last("/billetterie/x1/controle")).toBe("Contrôle d'entrée");
    expect(last("/profile/assistants")).toBe("Assistants connectés");
    expect(last("/rooms/checklists")).toBe("Contrôle des mains courantes");
  });

  it("sous-pages nommées par leur objet : détails, créations, pages hors espace", () => {
    const last = (p: string, dept: string | null = null) => buildBreadcrumb(spaces, p, dept).at(-1)?.label;
    expect(last("/accounting/requests/x1")).toBe("Demande");
    expect(last("/accounting/requests/new")).toBe("Nouvelle demande");
    expect(last("/requests/new")).toBe("Nouvelle demande");
    expect(last("/admin/messages/new")).toBe("Nouveau message");
    expect(last("/admin/messages/x1")).toBe("Message");
    expect(last("/admin/users/new")).toBe("Nouvel utilisateur");
    expect(last("/admin/access/users/x1")).toBe("Utilisateur");
    expect(last("/admin/churches/x1")).toBe("Église");
    expect(last("/dons/slide")).toBe("Slide de projection");
    expect(last("/agenda/schedule")).toBe("Planification");
    expect(last("/agenda/new")).toBe("Nouvelle entrée");
    expect(last("/agenda/x1")).toBe("Profil pastoral");
    expect(last("/candidatures/entretiens")).toBe("Entretiens");
    expect(last("/candidatures/ma-fiche")).toBe("Ma fiche");
    expect(last("/formulaires/mes-reponses")).toBe("Mes réponses");
    expect(last("/billetterie/x1/badges")).toBe("Badges");
    expect(last("/billetterie/x1/images")).toBe("Images du site");
    expect(last("/billetterie/mes-reservations")).toBe("Mes réservations");
    expect(last("/media/events/new")).toBe("Nouvel événement");
    expect(last("/jobs/freelance/missions/new")).toBe("Nouvelle mission");
    expect(last("/messages/x1")).toBe("Message de l'administration");
    expect(last("/mcp/autoriser")).toBe("Connecter un assistant IA");
    expect(buildBreadcrumb(spaces, "/dashboard/stats", "d1").map((c) => c.label)).toEqual(["Planning", "Louange", "Son", "Statistiques"]);
    expect(buildBreadcrumb(spaces, "/dashboard", "d1").at(-1)?.label).toBe("Son");
  });

  it("chaque page connectée hors redirection a un fil d'Ariane", () => {
    const redirects = ["/absences", "/admin"];
    const pastoral = (p: string) => p === "/pastoral" || p.startsWith("/pastoral/");
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
    expect(buildBreadcrumb(star, "/planning/events").map((c) => c.label)).toEqual(["Agenda de l'église"]);
    expect(buildBreadcrumb(star, "/profile/assistants").map((c) => c.label)).toEqual(["Mon profil", "Assistants connectés"]);
  });
});
