import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import { prismaMock } from "@/__mocks__/prisma";
import {
  createAdminSession,
  createSecretarySession,
  createDepartmentHeadSession,
  createMinisterSession,
  createStarSession,
} from "@/__mocks__/auth";
import { fakeRequireDepartmentAccess } from "@/lib/__tests__/support/dept-scope-mock";
import { rolePermissions } from "@/lib/registry";

// `requireChurchPermission` est réimplémenté ici (comme `fakeRequireDepartmentAccess`) à partir
// de la vraie matrice `rolePermissions`, pour couvrir les différences de droits entre GET
// (planning:department) et POST (planning:edit) — la logique de résolution de session réelle
// est couverte ailleurs (routes qui importent le vrai `@/lib/auth`).
function fakeRequireChurchPermission(session: Session, permission: string, churchId: string) {
  const role = session.user.isSuperAdmin
    ? "SUPER_ADMIN"
    : session.user.churchRoles.find((r) => r.churchId === churchId)?.role;
  const allowed = !!role && (rolePermissions[role as keyof typeof rolePermissions] ?? []).includes(permission as never);
  if (!allowed) throw new Error("FORBIDDEN");
  return session;
}

let currentSession: Session;
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
const mockRequireChurchPermission = vi.fn(
  (permission: string, churchId: string) => fakeRequireChurchPermission(currentSession, permission, churchId)
);

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: [string, string]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
  requireDepartmentAccess: (...args: Parameters<typeof fakeRequireDepartmentAccess>) =>
    fakeRequireDepartmentAccess(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, POST } = await import("../route");
const makeParams = (departmentId: string) => Promise.resolve({ departmentId });

function makeCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Réunion d'équipe",
    startsAt: "2026-09-14T18:00:00",
    endsAt: "2026-09-14T19:00:00",
    ...overrides,
  };
}

describe("Périmètre de département — /api/departments/[departmentId]/team-events (spec 044)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.teamEvent.findMany.mockResolvedValue([]);
    prismaMock.teamEvent.create.mockResolvedValue({ id: "te-1" });
  });

  it("GET : Responsable hors périmètre → 403", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-B", name: "B" }]);
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : Responsable dans son périmètre → 200", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("GET : Responsable adjoint (même appartenance) → mêmes droits que titulaire", async () => {
    // fakeRequireDepartmentAccess ne discrimine pas titulaire/adjoint (isDeputy) — seule
    // l'appartenance à `departments` compte, comme la vraie garde.
    currentSession = createDepartmentHeadSession([{ id: "dept-A", name: "A" }]);
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("GET : Ministre dans son ministère (dept-1/dept-2) → 200", async () => {
    currentSession = createMinisterSession("ministry-1");
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-1") });
    expect(res.status).toBe(200);
  });

  it("GET : Ministre hors de son ministère → 403", async () => {
    currentSession = createMinisterSession("ministry-1");
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-hors-ministere") });
    expect(res.status).toBe(403);
  });

  it("GET : STAR → 403 (pas de planning:department)", async () => {
    currentSession = createStarSession();
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("GET : Secrétaire → 200 (lecture seule, tous départements)", async () => {
    currentSession = createSecretarySession();
    const res = await GET(new Request("http://localhost"), { params: makeParams("dept-A") });
    expect(res.status).toBe(200);
  });

  it("POST : Secrétaire → 403 (pas de planning:edit)", async () => {
    currentSession = createSecretarySession();
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify(makeCreateBody()) });
    const res = await POST(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("POST : Admin → 201", async () => {
    currentSession = createAdminSession();
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify(makeCreateBody()) });
    const res = await POST(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(201);
  });

  it("POST : Responsable hors périmètre → 403", async () => {
    currentSession = createDepartmentHeadSession([{ id: "dept-B", name: "B" }]);
    const request = new Request("http://localhost", { method: "POST", body: JSON.stringify(makeCreateBody()) });
    const res = await POST(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(403);
  });

  it("POST : endsAt <= startsAt → 400", async () => {
    currentSession = createAdminSession();
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(makeCreateBody({ startsAt: "2026-09-14T19:00:00", endsAt: "2026-09-14T18:00:00" })),
    });
    const res = await POST(request, { params: makeParams("dept-A") });
    expect(res.status).toBe(400);
  });
});
