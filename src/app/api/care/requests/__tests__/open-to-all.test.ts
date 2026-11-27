/**
 * Spec 092, lot 3 (T3.4) — demande de rendez-vous pastoral ouverte à tout compte de l'église :
 * gardes réelles de `@/lib/auth` et limiteur réel (seul `auth()` est simulé). La lecture des
 * demandes (GET) reste réservée : un STAR n'y voit rien.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createStarSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications", () => ({
  notifyUsersWithRole: vi.fn().mockResolvedValue(undefined),
  dispatchUserEmails: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn(),
  notifyUsers: vi.fn(),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const { GET, POST } = await import("../route");

function role(r: string, churchId = "church-1") {
  return { id: `r-${r}-${churchId}`, churchId, role: r, ministryId: null, church: { id: churchId, name: "Église", slug: "eglise" }, departments: [] };
}

let n = 0;
function as(user: Record<string, unknown>) {
  // Un identifiant différent par test : le limiteur est en mémoire, propre au compte.
  mockAuth.mockResolvedValue(createSession({ id: `user-${++n}`, ...user } as never));
}

function post(churchId = "church-1") {
  return POST(
    new Request("http://localhost/api/care/requests", {
      method: "POST",
      body: JSON.stringify({ churchId, firstName: "Jean", lastName: "Dupont", subject: "RDV", message: "Besoin d'un entretien" }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.appointmentRequest.create.mockResolvedValue({ id: "apt-1" } as never);
  prismaMock.church.findUnique.mockResolvedValue({ name: "ICC" } as never);
});

describe("POST /api/care/requests — tout compte de l'église", () => {
  it.each(["REPORTER", "ACCOUNTANT", "PASTORAL_CARE_REFERENT", "STAR", "DISCIPLE_MAKER"])("%s : 201", async (r) => {
    as({ churchRoles: [role(r)] });
    expect((await post()).status).toBe(201);
  });

  it("profil pastoral sans rôle : 201", async () => {
    as({ churchRoles: [], pastoralChurchIds: ["church-1"] });
    expect((await post()).status).toBe(201);
  });

  it("compte d'une autre église : 403, rien n'est créé", async () => {
    as({ churchRoles: [role("ADMIN", "church-2")], pastoralChurchIds: ["church-3"] });
    expect((await post("church-1")).status).toBe(403);
    expect(prismaMock.appointmentRequest.create).not.toHaveBeenCalled();
  });

  it("débit : la 6e demande dans l'heure est refusée (429)", async () => {
    as({ churchRoles: [role("REPORTER")] });
    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
    expect(prismaMock.appointmentRequest.create).toHaveBeenCalledTimes(5);
  });

  it("la demande est rattachée au compte appelant, pas à un identifiant fourni", async () => {
    as({ churchRoles: [role("STAR")] });
    await post();
    expect(prismaMock.appointmentRequest.create.mock.calls[0][0].data.userId).toBe(`user-${n}`);
  });
});

describe("GET /api/care/requests — visibilité inchangée", () => {
  it("un STAR (sans care:view ni profil accompagnant) ne lit pas les demandes", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    prismaMock.pastoralProfile.findMany.mockResolvedValue([]);
    prismaMock.department.findMany.mockResolvedValue([]);
    prismaMock.member.findMany.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/care/requests?churchId=church-1"));
    expect(res.status).toBe(403);
    expect(prismaMock.appointmentRequest.findMany).not.toHaveBeenCalled();
  });
});
