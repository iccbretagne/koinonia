// Spec 049 — `isMediaTeamMember` distingue deux activités (PHOTOS, VISUELS) portées par des
// fonctions de département distinctes, avec repli PHOTOS → PRODUCTION_MEDIA quand aucun
// département de l'église ne porte la fonction PHOTOS (aucune église ne perd la gestion de ses
// photos au déploiement de cette fonction).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createDepartmentHeadSession, createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { isMediaTeamMember } = await import("@/lib/auth");

const PHOTO_DEPT = { id: "dept-photo", name: "Photos" };
const PROD_MEDIA_DEPT = { id: "dept-prod-media", name: "Production Média" };
const COMM_DEPT = { id: "dept-comm", name: "Communication" };
const OTHER_DEPT = { id: "dept-other", name: "Autre" };

function mockFunctionDepartments(byFunction: Record<string, string[]>) {
  prismaMock.department.findMany.mockImplementation(({ where }: { where: { function: string } }) =>
    Promise.resolve((byFunction[where.function] ?? []).map((id) => ({ id })))
  );
}

describe("isMediaTeamMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("membre PHOTOS : accès photos, pas visuels", async () => {
    mockFunctionDepartments({ PHOTOS: [PHOTO_DEPT.id], PRODUCTION_MEDIA: [] });
    const session = createDepartmentHeadSession([PHOTO_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(true);
    await expect(isMediaTeamMember(session, "church-1", "VISUELS")).resolves.toBe(false);
  });

  it("membre PRODUCTION_MEDIA avec fonction PHOTOS configurée dans l'église : n'a pas accès aux photos", async () => {
    mockFunctionDepartments({ PHOTOS: [PHOTO_DEPT.id], PRODUCTION_MEDIA: [PROD_MEDIA_DEPT.id] });
    const session = createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(false);
    await expect(isMediaTeamMember(session, "church-1", "VISUELS")).resolves.toBe(true);
  });

  it("membre PRODUCTION_MEDIA sans fonction PHOTOS configurée dans l'église : repli, garde les photos", async () => {
    mockFunctionDepartments({ PHOTOS: [], PRODUCTION_MEDIA: [PROD_MEDIA_DEPT.id] });
    const session = createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(true);
    await expect(isMediaTeamMember(session, "church-1", "VISUELS")).resolves.toBe(true);
  });

  it("membre Communication seul : n'a ni photos ni visuels via isMediaTeamMember (couvert séparément par isCommunicationMember)", async () => {
    mockFunctionDepartments({ PHOTOS: [], PRODUCTION_MEDIA: [] });
    const session = createDepartmentHeadSession([COMM_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(false);
    await expect(isMediaTeamMember(session, "church-1", "VISUELS")).resolves.toBe(false);
  });

  it("Super Admin/Admin : isMediaTeamMember seul ne suffit pas — media:manage est vérifié ailleurs (requireMediaAccess)", async () => {
    mockFunctionDepartments({ PHOTOS: [], PRODUCTION_MEDIA: [] });
    const session = createAdminSession("church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(false);
  });

  it("département hors périmètre (autre fonction) : aucun accès", async () => {
    mockFunctionDepartments({ PHOTOS: [PHOTO_DEPT.id], PRODUCTION_MEDIA: [PROD_MEDIA_DEPT.id] });
    const session = createDepartmentHeadSession([OTHER_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-1", "PHOTOS")).resolves.toBe(false);
    await expect(isMediaTeamMember(session, "church-1", "VISUELS")).resolves.toBe(false);
  });

  it("église tierce : le département de l'utilisateur n'existe pas dans cette église", async () => {
    mockFunctionDepartments({ PHOTOS: [PHOTO_DEPT.id] });
    const session = createDepartmentHeadSession([PHOTO_DEPT], "church-1");
    await expect(isMediaTeamMember(session, "church-2", "PHOTOS")).resolves.toBe(false);
  });
});
