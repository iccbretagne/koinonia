import { describe, it, expect } from "vitest";
import { buildSpaces, resolveActive, type NavigationInput } from "../navigation";

/** Entrée « Billetterie » dans l'espace Agenda (spec 074). */
const base: NavigationInput = { departments: [], configLinks: [], requestLinks: [], mediaLinks: [], homeHref: "/planning" };
const agenda = (input: NavigationInput) => buildSpaces(input).find((s) => s.key === "events")?.pages ?? [];

describe("navigation — billetterie (spec 074)", () => {
  it("absente sans droit ni rôle d'événement", () => {
    expect(agenda({ ...base, hasEventsAccess: true }).map((p) => p.href)).not.toContain("/evenements/billetterie");
  });

  it("présente dans l'Agenda, bloc « Inscriptions », même pour un STAR qui n'a qu'un rôle d'événement", () => {
    const pages = agenda({ ...base, hasTicketing: true });
    expect(pages.find((p) => p.href === "/evenements/billetterie")).toMatchObject({ label: "Billetterie", sidebarBlock: "Inscriptions" });
  });

  it("le tableau de bord d'un événement allume « Billetterie »", () => {
    const spaces = buildSpaces({ ...base, hasEventsAccess: true, hasTicketing: true });
    expect(resolveActive(spaces, "/evenements/billetterie/ev-1")).toEqual({ space: "events", page: "/evenements/billetterie" });
  });
});
