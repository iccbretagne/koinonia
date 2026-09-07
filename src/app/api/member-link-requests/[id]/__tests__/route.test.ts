/**
 * Tests — Non-régression de l'approbation d'une demande de liaison (spec 037, T1).
 *
 * Filet de sécurité écrit AVANT l'extraction de la transaction d'approbation vers
 * `admitToChurch()` (T2/T3) : ces tests figent le comportement actuel et doivent rester
 * verts sans être modifiés après l'extraction — c'est le critère de réussite de celle-ci.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/onboarding", () => ({ findDuplicateCandidates: vi.fn().mockResolvedValue([]) }));

const { PATCH } = await import("../route");
const makeParams = (id: string) => Promise.resolve({ id });

const baseLinkRequest = {
  id: "req-1",
  churchId: "church-1",
  userId: "user-1",
  memberId: null,
  firstName: "Emmanuella",
  lastName: "Sohou",
  phone: null,
  departmentId: "dept-1",
  ministryId: null,
  requestedRole: null,
  status: "PENDING",
  member: null,
  department: { id: "dept-1" },
  ministry: null,
  user: { id: "user-1", email: "emmanuella@example.com" },
};

function setupTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
}

describe("PATCH /api/member-link-requests/[id] — approbation (comportement actuel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.notification.create.mockResolvedValue({} as never);
    prismaMock.memberLinkRequest.update.mockResolvedValue({} as never);
  });

  it("attribue le rôle STAR quand la personne n'a encore aucun rôle dans l'église", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      requestedRole: null,
    } as never);
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "church-1" },
    } as never);
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Emmanuella",
      lastName: "Sohou",
    } as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null); // aucun rôle existant
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", churchId: "church-1", role: "STAR" },
    });
  });

  it("n'attribue PAS de rôle STAR si la personne a déjà un rôle dans l'église", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      requestedRole: null,
    } as never);
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "church-1" },
    } as never);
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Emmanuella",
      lastName: "Sohou",
    } as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "existing-role" } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.userChurchRole.create).not.toHaveBeenCalled();
  });

  it("crée le Member pour une demande de nouvelle fiche STAR", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      requestedRole: null,
    } as never);
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "church-1" },
    } as never);
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Emmanuella",
      lastName: "Sohou",
    } as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    await PATCH(request, { params: makeParams("req-1") });

    expect(prismaMock.member.create).toHaveBeenCalledWith({
      data: {
        firstName: "Emmanuella",
        lastName: "Sohou",
        phone: undefined,
        departments: { create: { departmentId: "dept-1", isPrimary: true } },
      },
    });
    expect(prismaMock.memberUserLink.create).toHaveBeenCalledWith({
      data: {
        memberId: "member-new",
        userId: "user-1",
        churchId: "church-1",
        validatedAt: expect.any(Date),
        validatedById: expect.any(String),
      },
    });
  });

  it("attribue le rôle Ministre demandé, avec le ministère de la demande", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      memberId: "member-existing",
      departmentId: null,
      ministryId: "ministry-1",
      requestedRole: "MINISTER",
      member: { id: "member-existing", firstName: "Emmanuella", lastName: "Sohou" },
    } as never);
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    prismaMock.memberUserLink.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    prismaMock.userChurchRole.create.mockResolvedValue({} as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.userChurchRole.create).toHaveBeenCalledWith({
      data: { userId: "user-1", churchId: "church-1", role: "MINISTER", ministryId: "ministry-1" },
    });
  });

  it("refuse si le département fourni n'appartient pas à l'église de la demande", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      requestedRole: null,
    } as never);
    prismaMock.department.findUnique.mockResolvedValue({
      id: "dept-1",
      ministry: { churchId: "AUTRE-EGLISE" },
    } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(400);
  });

  it("refuse si le ministère fourni n'appartient pas à l'église de la demande", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      memberId: "member-existing",
      departmentId: null,
      ministryId: "ministry-1",
      requestedRole: "MINISTER",
      member: { id: "member-existing", firstName: "Emmanuella", lastName: "Sohou" },
    } as never);
    prismaMock.ministry.findUnique.mockResolvedValue({ churchId: "AUTRE-EGLISE" } as never);
    setupTransaction();

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(400);
  });

  it("refuse une demande déjà traitée", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      status: "APPROVED",
    } as never);

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(409);
  });

  it("rejette une demande et notifie le demandeur", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
    } as never);
    prismaMock.memberLinkRequest.update.mockResolvedValue({ id: "req-1", status: "REJECTED" } as never);

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "reject", rejectReason: "Doublon" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(200);
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "MEMBER_LINK_REJECTED" }) })
    );
  });

  it("reconsidère une demande refusée et la repasse en PENDING", async () => {
    prismaMock.memberLinkRequest.findUnique.mockResolvedValue({
      ...baseLinkRequest,
      status: "REJECTED",
    } as never);
    prismaMock.memberLinkRequest.update.mockResolvedValue({ id: "req-1", status: "PENDING" } as never);

    const request = new Request("http://localhost/api/member-link-requests/req-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "reconsider" }),
    });
    const res = await PATCH(request, { params: makeParams("req-1") });

    expect(res.status).toBe(200);
  });
});
