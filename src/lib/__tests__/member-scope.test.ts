import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { isMemberInScope, isMemberFullyInScope, isLinkRequestInScope } = await import("../member-scope");
type MemberScope = { scoped: false } | { scoped: true; departmentIds: string[] };

const UNSCOPED: MemberScope = { scoped: false };
const SCOPED: MemberScope = { scoped: true, departmentIds: ["dept-a", "dept-b"] };

describe("isMemberInScope", () => {
  it("un appelant non restreint voit toujours vrai", () => {
    expect(isMemberInScope(UNSCOPED, [])).toBe(true);
    expect(isMemberInScope(UNSCOPED, ["dept-x"])).toBe(true);
  });

  it("vrai si au moins un département est commun", () => {
    expect(isMemberInScope(SCOPED, ["dept-b", "dept-hors"])).toBe(true);
  });

  it("faux si aucun département n'est commun", () => {
    expect(isMemberInScope(SCOPED, ["dept-hors"])).toBe(false);
  });

  it("faux pour une fiche sans aucun département", () => {
    expect(isMemberInScope(SCOPED, [])).toBe(false);
  });
});

describe("isMemberFullyInScope", () => {
  it("un appelant non restreint voit toujours vrai", () => {
    expect(isMemberFullyInScope(UNSCOPED, ["dept-x"])).toBe(true);
  });

  it("vrai si tous les départements sont dans le périmètre", () => {
    expect(isMemberFullyInScope(SCOPED, ["dept-a", "dept-b"])).toBe(true);
  });

  it("faux si un seul département déborde du périmètre", () => {
    expect(isMemberFullyInScope(SCOPED, ["dept-a", "dept-hors"])).toBe(false);
  });

  it("vrai (vacuité) pour une fiche sans aucun département", () => {
    expect(isMemberFullyInScope(SCOPED, [])).toBe(true);
  });

  it("un département commun ne suffit pas — plus strict que isMemberInScope", () => {
    const depts = ["dept-a", "dept-hors"];
    expect(isMemberInScope(SCOPED, depts)).toBe(true);
    expect(isMemberFullyInScope(SCOPED, depts)).toBe(false);
  });
});

describe("isLinkRequestInScope", () => {
  it("un appelant non restreint voit toujours vrai", () => {
    expect(isLinkRequestInScope(UNSCOPED, [], { departmentId: null, ministryId: null })).toBe(true);
  });

  it("vrai si le département demandé est dans le périmètre", () => {
    expect(isLinkRequestInScope(SCOPED, [], { departmentId: "dept-a", ministryId: null })).toBe(true);
  });

  it("vrai si le ministère demandé est un des ministères de l'appelant", () => {
    expect(
      isLinkRequestInScope(SCOPED, ["ministry-1"], { departmentId: null, ministryId: "ministry-1" })
    ).toBe(true);
  });

  it("vrai si la fiche existante partage un département avec l'appelant", () => {
    expect(
      isLinkRequestInScope(SCOPED, [], { departmentId: null, ministryId: null }, ["dept-b"])
    ).toBe(true);
  });

  it("faux si ni le département, ni le ministère, ni la fiche ne sont dans le périmètre", () => {
    expect(
      isLinkRequestInScope(
        SCOPED,
        ["ministry-1"],
        { departmentId: "dept-hors", ministryId: "ministry-hors" },
        ["dept-hors"]
      )
    ).toBe(false);
  });

  it("faux pour une demande sans ministère ni département (rôle transverse), fiche absente", () => {
    expect(isLinkRequestInScope(SCOPED, ["ministry-1"], { departmentId: null, ministryId: null })).toBe(false);
  });
});
