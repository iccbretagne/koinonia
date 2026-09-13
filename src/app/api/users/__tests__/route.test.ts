/**
 * Tests — GET /api/users : dérivation de `neverConnected` (spec 047)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET } = await import("../route");

describe("GET /api/users — neverConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
  });

  it("retourne neverConnected: true pour un utilisateur sans compte OAuth lié", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", email: "a@x.com", name: null, churchRoles: [], _count: { accounts: 0 } },
    ] as never);

    const request = new Request("http://localhost/api/users?churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].neverConnected).toBe(true);
    expect(body[0]._count).toBeUndefined();
  });

  it("retourne neverConnected: false dès qu'un compte OAuth est lié", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-2", email: "b@x.com", name: "Bob", churchRoles: [], _count: { accounts: 1 } },
    ] as never);

    const request = new Request("http://localhost/api/users?churchId=church-1");
    const res = await GET(request);
    const body = await res.json();

    expect(body[0].neverConnected).toBe(false);
  });

  it("retourne 400 si churchId manquant", async () => {
    const request = new Request("http://localhost/api/users");
    const res = await GET(request);
    expect(res.status).toBe(400);
  });
});
