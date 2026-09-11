// Spec 043 — `requireMediaCollectionAccess` ouvre les Collections à l'équipe Communication,
// sans élargir `requireMediaManageAccess` (qui protège aussi la suppression/le partage des
// projets, événements médias et fichiers — la Communication ne doit pas l'obtenir).
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

describe("requireMediaCollectionAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepte media:manage (Admin)", async () => {
    mockAuth.mockResolvedValue(createAdminSession("church-1"));
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("accepte un membre du département Production Média", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([PROD_MEDIA_DEPT], "church-1"));
    prismaMock.department.count.mockImplementation(({ where }: { where: { function: string } }) =>
      Promise.resolve(where.function === "PRODUCTION_MEDIA" ? 1 : 0)
    );
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("accepte un membre du département Communication", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([COMM_DEPT], "church-1"));
    prismaMock.department.count.mockImplementation(({ where }: { where: { function: string } }) =>
      Promise.resolve(where.function === "COMMUNICATION" ? 1 : 0)
    );
    await expect(requireMediaCollectionAccess("church-1")).resolves.toBeDefined();
  });

  it("refuse un STAR sans département de service", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([], "church-1"));
    await expect(requireMediaCollectionAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });
});

describe("requireMediaManageAccess — non-régression (spec 043)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse toujours un membre Communication", async () => {
    mockAuth.mockResolvedValue(createDepartmentHeadSession([COMM_DEPT], "church-1"));
    prismaMock.department.count.mockResolvedValue(0); // pas PRODUCTION_MEDIA
    await expect(requireMediaManageAccess("church-1")).rejects.toThrow("FORBIDDEN");
  });
});
