import { describe, it, expect } from "vitest";
import { matchesPath, activeHref } from "../nav-match";

describe("matchesPath", () => {
  it("correspond à l'URL exacte et à ses sous-pages", () => {
    expect(matchesPath("/medias/audio", "/medias/audio")).toBe(true);
    expect(matchesPath("/medias/audio/ecouter/abc", "/medias/audio")).toBe(true);
  });

  it("ne confond pas deux segments qui partagent un préfixe", () => {
    expect(matchesPath("/pastoral/suivi", "/demandes/rendez-vous")).toBe(false);
  });

  it("ignore la query string du lien", () => {
    expect(matchesPath("/planning/departements", "/planning/departements?dept=d1")).toBe(true);
  });
});

describe("activeHref", () => {
  it("retient le lien le plus spécifique parmi les frères", () => {
    const hrefs = ["/admin/departments", "/admin/departments/functions"];
    expect(activeHref("/admin/departments/functions", hrefs)).toBe("/admin/departments/functions");
    expect(activeHref("/admin/departments/abc", hrefs)).toBe("/admin/departments");
  });

  it("n'allume pas Mon planning sur les événements STAR", () => {
    expect(activeHref("/evenements", ["/planning", "/evenements"])).toBe("/evenements");
  });

  it("renvoie null quand aucun lien ne correspond", () => {
    expect(activeHref("/profile", ["/planning", "/evenements"])).toBeNull();
  });
});
