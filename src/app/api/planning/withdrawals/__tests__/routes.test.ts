import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import {
  createAdminSession,
  createAuthScopeMocks,
  createDepartmentHeadSession,
  createSecretarySession,
  createStarSession,
  fakeHasChurchPermission,
} from "@/__mocks__/auth";
import { ApiError } from "@/lib/api-utils";

let session: Session;
const mockResolveChurchId = vi.fn();
const scope = createAuthScopeMocks();
vi.mock("@/lib/auth", () => ({
  resolveChurchId: (...a: unknown[]) => mockResolveChurchId(...a),
  // Même règle que la vraie garde : permission des rôles de la session dans l'église visée.
  requireChurchPermission: async (permission: string, churchId: string) => {
    if (!(await fakeHasChurchPermission(session, permission, churchId))) throw new Error("FORBIDDEN");
    return session;
  },
  hasChurchPermission: (s: Session, permission: string, churchId: string) => fakeHasChurchPermission(s, permission, churchId),
  requireDepartmentAccess: (s: Session, churchId: string, departmentId: string) => {
    const sc = scope.getUserDepartmentScope(s, churchId);
    if (sc.scoped && !sc.departmentIds.includes(departmentId)) throw new Error("FORBIDDEN");
  },
}));

const withdrawService = vi.fn();
const resolveOwnMemberForDepartment = vi.fn();
const getWithdrawalDetail = vi.fn();
const cancelWithdrawal = vi.fn();
const isMemberLinkedToUser = vi.fn();
const replaceWithdrawal = vi.fn();
const closeWithdrawal = vi.fn();
const getWithdrawalOwner = vi.fn();
vi.mock("@/modules/planning", () => ({
  withdrawService: (...a: unknown[]) => withdrawService(...a),
  resolveOwnMemberForDepartment: (...a: unknown[]) => resolveOwnMemberForDepartment(...a),
  getWithdrawalDetail: (...a: unknown[]) => getWithdrawalDetail(...a),
  cancelWithdrawal: (...a: unknown[]) => cancelWithdrawal(...a),
  isMemberLinkedToUser: (...a: unknown[]) => isMemberLinkedToUser(...a),
  replaceWithdrawal: (...a: unknown[]) => replaceWithdrawal(...a),
  closeWithdrawal: (...a: unknown[]) => closeWithdrawal(...a),
  getWithdrawalOwner: (...a: unknown[]) => getWithdrawalOwner(...a),
}));

const collection = await import("../route");
const item = await import("../[id]/route");
const replace = await import("../[id]/replace/route");
const close = await import("../[id]/close/route");

const params = (id = "w-1") => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST") => new Request("http://localhost", { method, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveChurchId.mockResolvedValue("church-1");
  getWithdrawalOwner.mockResolvedValue({ departmentId: "dept-1", memberId: "paul" });
});

describe("POST /api/planning/withdrawals", () => {
  it("201 : la fiche liée du STAR dans le département se désiste, église de l'événement", async () => {
    session = createStarSession();
    resolveOwnMemberForDepartment.mockResolvedValue("paul");
    withdrawService.mockResolvedValue({ id: "w-1" });

    const res = await collection.POST(json({ eventId: "evt-1", departmentId: "dept-1", message: " fièvre " }));

    expect(res.status).toBe(201);
    expect(mockResolveChurchId).toHaveBeenCalledWith("event", "evt-1");
    expect(withdrawService).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-1", memberId: "paul", actorId: session.user.id, message: "fièvre" })
    );
  });

  it("403 sans fiche STAR liée dans ce département", async () => {
    session = createStarSession();
    resolveOwnMemberForDepartment.mockRejectedValue(new ApiError(403, "Aucune fiche STAR liée"));
    expect((await collection.POST(json({ eventId: "evt-1", departmentId: "dept-1" }))).status).toBe(403);
    expect(withdrawService).not.toHaveBeenCalled();
  });

  it("400 pour un message de plus de 500 caractères", async () => {
    session = createStarSession();
    expect((await collection.POST(json({ eventId: "evt-1", departmentId: "dept-1", message: "x".repeat(501) }))).status).toBe(400);
  });

  it("403 dans une église où l'appelant n'a aucun rôle (isolation multi-église)", async () => {
    session = createStarSession("church-2");
    expect((await collection.POST(json({ eventId: "evt-1", departmentId: "dept-1" }))).status).toBe(403);
  });
});

describe("GET /api/planning/withdrawals/[id]", () => {
  it("responsable du département : détail avec droit de remplacer", async () => {
    session = createDepartmentHeadSession([{ id: "dept-1", name: "Choristes" }]);
    getWithdrawalDetail.mockResolvedValue({ canReplace: true });
    const res = await item.GET(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    expect(mockResolveChurchId).toHaveBeenCalledWith("serviceWithdrawal", "w-1");
    expect(getWithdrawalDetail).toHaveBeenCalledWith("w-1", { viewerCanEdit: true });
  });

  it("403 hors du périmètre de départements", async () => {
    session = createDepartmentHeadSession([{ id: "dept-9", name: "Accueil" }]);
    expect((await item.GET(new Request("http://localhost"), params())).status).toBe(403);
    expect(getWithdrawalDetail).not.toHaveBeenCalled();
  });

  it("Secrétaire : lecture seule", async () => {
    session = createSecretarySession();
    getWithdrawalDetail.mockResolvedValue({ canReplace: false });
    expect((await item.GET(new Request("http://localhost"), params())).status).toBe(200);
    expect(getWithdrawalDetail).toHaveBeenCalledWith("w-1", { viewerCanEdit: false });
  });

  it("STAR : 403 (pas de planning:department)", async () => {
    session = createStarSession();
    expect((await item.GET(new Request("http://localhost"), params())).status).toBe(403);
  });
});

describe("DELETE /api/planning/withdrawals/[id]", () => {
  it("le STAR désisté annule son désistement", async () => {
    session = createStarSession();
    isMemberLinkedToUser.mockResolvedValue(true);
    cancelWithdrawal.mockResolvedValue({ id: "w-1" });
    expect((await item.DELETE(new Request("http://localhost"), params())).status).toBe(200);
    expect(isMemberLinkedToUser).toHaveBeenCalledWith("paul", session.user.id, "church-1");
  });

  it("403 si la fiche désistée n'est pas liée au compte", async () => {
    session = createStarSession();
    isMemberLinkedToUser.mockResolvedValue(false);
    expect((await item.DELETE(new Request("http://localhost"), params())).status).toBe(403);
    expect(cancelWithdrawal).not.toHaveBeenCalled();
  });

  it("relaie le 409 d'un service déjà pourvu", async () => {
    session = createStarSession();
    isMemberLinkedToUser.mockResolvedValue(true);
    cancelWithdrawal.mockRejectedValue(new ApiError(409, "Ce service a déjà été pourvu par Léa Bernard"));
    expect((await item.DELETE(new Request("http://localhost"), params())).status).toBe(409);
  });
});

describe("POST /api/planning/withdrawals/[id]/replace", () => {
  it("responsable du département : remplacement", async () => {
    session = createDepartmentHeadSession([{ id: "dept-1", name: "Choristes" }]);
    replaceWithdrawal.mockResolvedValue({ id: "w-1", replacementName: "Léa Bernard" });
    const res = await replace.POST(json({ memberId: "lea" }), params());
    expect(res.status).toBe(200);
    expect(replaceWithdrawal).toHaveBeenCalledWith({ withdrawalId: "w-1", memberId: "lea", actorId: session.user.id });
  });

  it("403 pour la Secrétaire (pas de planning:edit)", async () => {
    session = createSecretarySession();
    expect((await replace.POST(json({ memberId: "lea" }), params())).status).toBe(403);
    expect(replaceWithdrawal).not.toHaveBeenCalled();
  });

  it("403 hors du périmètre de départements", async () => {
    session = createDepartmentHeadSession([{ id: "dept-9", name: "Accueil" }]);
    expect((await replace.POST(json({ memberId: "lea" }), params())).status).toBe(403);
  });

  it("400 sans memberId", async () => {
    session = createAdminSession();
    expect((await replace.POST(json({}), params())).status).toBe(400);
  });

  it("relaie 409 (déjà pourvu) et 422 (candidat invalide)", async () => {
    session = createAdminSession();
    replaceWithdrawal.mockRejectedValueOnce(new ApiError(409, "déjà pourvu"));
    expect((await replace.POST(json({ memberId: "lea" }), params())).status).toBe(409);
    replaceWithdrawal.mockRejectedValueOnce(new ApiError(422, "plus disponible"));
    expect((await replace.POST(json({ memberId: "lea" }), params())).status).toBe(422);
  });
});

describe("POST /api/planning/withdrawals/[id]/close", () => {
  it("responsable : « Ne pas remplacer »", async () => {
    session = createDepartmentHeadSession([{ id: "dept-1", name: "Choristes" }]);
    closeWithdrawal.mockResolvedValue({ id: "w-1" });
    expect((await close.POST(new Request("http://localhost", { method: "POST" }), params())).status).toBe(200);
    expect(closeWithdrawal).toHaveBeenCalledWith({ withdrawalId: "w-1", actorId: session.user.id });
  });

  it("403 pour la Secrétaire", async () => {
    session = createSecretarySession();
    expect((await close.POST(new Request("http://localhost", { method: "POST" }), params())).status).toBe(403);
    expect(closeWithdrawal).not.toHaveBeenCalled();
  });
});
