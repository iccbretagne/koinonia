/** Page « Nouvelle demande » comptable : droits, départements proposés, correction d'une demande rejetée. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { createSession, createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const mockSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => mockSession(),
  getCurrentChurchId: async () => "church-1",
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("../NewRequestForm", () => ({ default: function NewRequestForm() { return null; } }));

const Page = (await import("../page")).default;

async function formProps(params: Record<string, string> = {}) {
  const page = (await Page({ searchParams: Promise.resolve(params) })) as ReactElement<{ children: ReactElement[] }>;
  const form = (page.props.children as ReactElement<Record<string, unknown>>[])[1];
  return form.props as Record<string, unknown>;
}

const dept = (id: string, name: string, ministry = "M") => ({ id, name, ministry: { name: ministry } });

function ministerSession() {
  return createSession({
    churchRoles: [{ id: "r", churchId: "church-1", role: "MINISTER", ministryId: "min-1", church: { id: "church-1", name: "R", slug: "r" }, departments: [] }],
  });
}

describe("NewAccountingRequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.department.findMany.mockResolvedValue([dept("all-1", "Tous")] as never);
    prismaMock.financialRequest.findFirst.mockResolvedValue(null);
  });

  it("renvoie vers la liste sans accounting:submit ni profil pastoral", async () => {
    mockSession.mockResolvedValue(createSession({
      churchRoles: [{ id: "r", churchId: "church-1", role: "STAR", ministryId: null, church: { id: "church-1", name: "R", slug: "r" }, departments: [] }],
    }));
    await expect(formProps()).rejects.toThrow("REDIRECT:/accounting/requests");
  });

  it("propose tous les départements de l'église à l'administration", async () => {
    mockSession.mockResolvedValue(createAdminSession());
    const props = await formProps();
    expect(props.departments).toEqual([dept("all-1", "Tous")]);
    expect(props.correction).toBeNull();
    expect(props.redirectTo).toBe("/accounting/requests");
    expect(prismaMock.userChurchRole.findMany).not.toHaveBeenCalled();
  });

  it("propose à un pasteur sans rôle tous les départements", async () => {
    mockSession.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] }));
    expect((await formProps()).departments).toEqual([dept("all-1", "Tous")]);
  });

  it("propose à un Ministre les départements de ses ministères", async () => {
    mockSession.mockResolvedValue(ministerSession());
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ ministryId: "min-1", departments: [] }, { ministryId: null, departments: [] }] as never);
    prismaMock.department.findMany.mockResolvedValueOnce([dept("m-1", "Choristes")] as never);
    expect((await formProps()).departments).toEqual([dept("m-1", "Choristes")]);
    expect(prismaMock.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ministryId: { in: ["min-1"] } } }));
  });

  it("à défaut de ministère, un Ministre retombe sur tous les départements", async () => {
    mockSession.mockResolvedValue(ministerSession());
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ ministryId: null, departments: [] }] as never);
    expect((await formProps()).departments).toEqual([dept("all-1", "Tous")]);
  });

  it("propose à un responsable ses départements, dédoublonnés et triés", async () => {
    mockSession.mockResolvedValue(createDepartmentHeadSession([{ id: "d", name: "D" }]));
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { ministryId: null, departments: [{ department: dept("d-2", "Son") }, { department: dept("d-1", "Accueil") }] },
      { ministryId: null, departments: [{ department: dept("d-2", "Son") }] },
    ] as never);
    expect((await formProps()).departments).toEqual([dept("d-1", "Accueil"), dept("d-2", "Son")]);
    expect(prismaMock.department.findMany).not.toHaveBeenCalled();
  });

  it("préremplit la correction d'une demande rejetée, depuis « Mes demandes »", async () => {
    mockSession.mockResolvedValue(createAdminSession());
    prismaMock.financialRequest.findFirst.mockResolvedValue({
      id: "fr-1", type: "PURCHASE", departmentId: "d-1", label: "Sono", description: null, amount: { toString: () => "12.50" }, _count: { attachments: 2 },
    } as never);
    const props = await formProps({ correctionOf: "fr-1", from: "requests" });
    expect(props.correction).toEqual({
      id: "fr-1", type: "PURCHASE", departmentId: "d-1", label: "Sono", description: null, amount: "12.50", attachmentCount: 2,
    });
    expect(props.redirectTo).toBe("/requests");
    expect(prismaMock.financialRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fr-1", churchId: "church-1", submittedById: "user-1", status: "REJECTED" } })
    );
  });
});
