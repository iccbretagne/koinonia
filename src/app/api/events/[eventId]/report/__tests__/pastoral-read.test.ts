/**
 * Spec 092, lot 3 (T3.2, T3.13) — lecture pastorale du compte rendu : un profil pastoral sans
 * rôle lit le compte rendu d'un événement de SON église, jamais d'une autre, et ne l'écrit pas.
 * Les gardes réelles de `@/lib/auth` sont exercées (seul `auth()` est simulé).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { GET, PUT } = await import("../route");
const { GET: EXPORT } = await import("../../../reports/export/route");

const params = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const pastor = () => createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(pastor());
  prismaMock.eventReport.findUnique.mockResolvedValue({ id: "rp-1", eventId: "evt-1", sections: [] } as never);
});

describe("GET /api/events/[eventId]/report — lecture pastorale", () => {
  it("pasteur sans rôle : 200 pour un événement de son église", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    const res = await GET(new Request("http://localhost/api/events/evt-1/report"), params("evt-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("rp-1");
  });

  it("pasteur sans rôle : 403 pour un événement d'une autre église (l'église de l'objet fait foi)", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-2" } as never);
    const res = await GET(new Request("http://localhost/api/events/evt-2/report"), params("evt-2"));
    expect(res.status).toBe(403);
    expect(prismaMock.eventReport.findUnique).not.toHaveBeenCalled();
  });

  it("compte sans rôle ni profil pastoral : 403", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: [] } as never));
    prismaMock.event.findUnique.mockResolvedValue({ churchId: "church-1" } as never);
    const res = await GET(new Request("http://localhost/api/events/evt-1/report"), params("evt-1"));
    expect(res.status).toBe(403);
  });
});

describe("écritures et export refusés au pasteur", () => {
  it("PUT du compte rendu : 403, rien n'est écrit", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: "evt-1", churchId: "church-1", reportEnabled: true } as never);
    const res = await PUT(
      new Request("http://localhost/api/events/evt-1/report", { method: "PUT", body: JSON.stringify({ sections: [] }) }),
      params("evt-1")
    );
    expect(res.status).toBe(403);
    expect(prismaMock.eventReport.upsert).not.toHaveBeenCalled();
  });

  it("export Excel des comptes rendus : 403", async () => {
    const res = await EXPORT(new Request("http://localhost/api/events/reports/export?churchId=church-1&from=2026-01-01&to=2026-12-31"));
    expect(res.status).toBe(403);
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });
});
