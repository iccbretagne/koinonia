/** Page /admin/members/duplicates : groupes de doublons sérialisés pour la vue, au périmètre de l'appelant. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { createAdminSession, createDepartmentHeadSession, createAuthScopeMocks } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockSession = vi.fn();
const mockChurchId = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockSession(),
  getCurrentChurchId: () => mockChurchId(),
  requireChurchPermission: vi.fn(),
  ...createAuthScopeMocks(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/link", () => ({ default: function Link() { return null; } }));
vi.mock("../DuplicatesView", () => ({ default: function DuplicatesView() { return null; } }));

const Page = (await import("../page")).default;

function member(id: string, firstName: string, email: string | null = null) {
  return {
    id,
    firstName,
    lastName: "Durand",
    email,
    phone: null,
    departments: [{ isPrimary: true, department: { id: "d1", name: "Son", ministry: { name: "Tech" } } }],
    userLinks: id === "m1" ? [{ userId: "u1", user: { name: "Anne", email: "a@x.fr" } }] : [],
    _count: { plannings: 3, discipleships: 1, disciplesMade: 0 },
  };
}

async function viewProps() {
  const page = (await Page()) as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
  return page.props.children[1].props;
}

describe("DuplicatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChurchId.mockResolvedValue("church-1");
    mockSession.mockResolvedValue(createAdminSession());
    prismaMock.member.findMany.mockResolvedValue([member("m1", "Anne"), member("m2", " anne "), member("m3", "Luc")] as never);
  });

  it("sans église courante, affiche un message", async () => {
    mockChurchId.mockResolvedValue(null);
    const page = (await Page()) as ReactElement<{ children: string }>;
    expect(page.props.children).toBe("Aucune église sélectionnée.");
  });

  it("transmet les groupes et tous les STAR sérialisés, avec le droit d'attribuer le rôle STAR", async () => {
    const props = await viewProps();
    expect(props.canAssignStarRoles).toBe(true);
    expect(props.churchId).toBe("church-1");
    expect(props.groups).toEqual([
      {
        reason: "same_name",
        members: [
          expect.objectContaining({ id: "m1", userLink: { userId: "u1", name: "Anne", email: "a@x.fr" } }),
          expect.objectContaining({ id: "m2", userLink: null }),
        ],
      },
    ]);
    expect((props.allMembers as unknown[])[0]).toEqual({
      id: "m1",
      firstName: "Anne",
      lastName: "Durand",
      email: null,
      phone: null,
      departments: [{ id: "d1", name: "Son", ministryName: "Tech", isPrimary: true }],
      userLink: { userId: "u1", name: "Anne", email: "a@x.fr" },
      counts: { plannings: 3, disciples: 1, disciplesMade: 0 },
    });
  });

  it("filtre au périmètre d'un responsable, sans droit d'attribuer le rôle STAR", async () => {
    mockSession.mockResolvedValue(createDepartmentHeadSession([{ id: "d1", name: "Son" }]));
    const props = await viewProps();
    expect(props.canAssignStarRoles).toBe(false);
    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departments: { some: { departmentId: { in: ["d1"] } } } } })
    );
  });
});
