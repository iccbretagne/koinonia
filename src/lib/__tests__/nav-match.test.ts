import { describe, it, expect } from "vitest";
import { matchesPath, activeHref } from "../nav-match";

describe("matchesPath", () => {
  it("correspond à l'URL exacte et à ses sous-pages", () => {
    expect(matchesPath("/audio", "/audio")).toBe(true);
    expect(matchesPath("/audio/ecouter/abc", "/audio")).toBe(true);
  });

  it("ne confond pas deux segments qui partagent un préfixe", () => {
    expect(matchesPath("/agenda/requests", "/agenda/request")).toBe(false);
  });

  it("ignore la query string du lien", () => {
    expect(matchesPath("/dashboard", "/dashboard?dept=d1")).toBe(true);
  });
});

describe("activeHref", () => {
  it("retient le lien le plus spécifique parmi les frères", () => {
    const hrefs = ["/admin/departments", "/admin/departments/functions"];
    expect(activeHref("/admin/departments/functions", hrefs)).toBe("/admin/departments/functions");
    expect(activeHref("/admin/departments/abc", hrefs)).toBe("/admin/departments");
  });

  it("n'allume pas Mon planning sur les événements STAR", () => {
    expect(activeHref("/planning/events", ["/planning", "/planning/events"])).toBe("/planning/events");
  });

  it("renvoie null quand aucun lien ne correspond", () => {
    expect(activeHref("/profile", ["/planning", "/events"])).toBeNull();
  });
});
