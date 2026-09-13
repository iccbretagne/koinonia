// Spec 049 (remplace spec 043) — `requireMediaCollectionAccess` ouvre le partage à l'équipe
// Communication en plus des équipes Photos/Production Média, sans élargir
// `requireMediaManageAccess` (qui protège aussi la suppression/le partage des projets,
// événements médias et fichiers — la Communication ne doit pas l'obtenir).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { requireMediaCollectionAccess, requireMediaManageAccess } = await import("@/lib/auth");

const PROD_MEDIA_DEPT = { id: "dept-prod-media", name: "Production Média" };
const COMM_DEPT = { id: "dept-comm", name: "Communication" };

function mockFunctionDepartments(fn: string, deptIds: string[]) {
  prismaMock.department.findMany.mockImplementation(({ where }: { where: { function: string } }) =>
    Promise.resolve(where.function === fn ? deptIds.map((id) => ({ id })) : [])
  );
}

describe("requireMediaCollectionAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepte media:manage (Admin)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.department.findMany.mockResolvedValue([]);
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("accepte un membre du département Production Média (aucune fonction Photos configurée — repli)", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1"));
    mockFunctionDepartments("PRODUCTION_MEDIA", [PROD_MEDIA_DEPT.id]);
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("accepte un membre du département Communication", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([COMM_DEPT], "church-1"));
    prismaMock.department.findMany.mockResolvedValue([]); // ni PHOTOS ni PRODUCTION_MEDIA
    prismaMock.department.count.mockResolvedValue(1); // isCommunicationMember
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("refuse un STAR sans département de service", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([], "church-1"));
    prismaMock.department.findMany.mockResolvedValue([]);
    await expect(requireMediaCollectionAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireMediaManageAccess — non-régression (spec 049)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse toujours un membre Communication sur les visuels", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([COMM_DEPT], "church-1"));
    prismaMock.department.findMany.mockResolvedValue([]); // pas PRODUCTION_MEDIA
    await expect(requireMediaManageAccess("church-1", "VISUELS")).rejects.toThrow("FORBIDDEN");
  });

  it("refuse toujours un membre Communication sur les photos", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([COMM_DEPT], "church-1"));
    prismaMock.department.findMany.mockResolvedValue([]);
    await expect(requireMediaManageAccess("church-1", "PHOTOS")).rejects.toThrow("FORBIDDEN");
  });
});
