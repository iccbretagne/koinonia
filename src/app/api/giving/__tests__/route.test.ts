import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { createSession, createSuperAdminSession, fakeHasChurchPermission } from "@/__mocks__/auth";

let currentSession: Session;
const requireChurchPermission = vi.fn(async (permission: string, churchId: string) => {
  if (!(await fakeHasChurchPermission(currentSession, permission, churchId))) throw new Error("FORBIDDEN");
  return currentSession;
});
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (permission: string, churchId: string) => requireChurchPermission(permission, churchId),
}));

const getGivingSettings = vi.fn();
const updateGivingPage = vi.fn();
vi.mock("@/modules/giving", () => ({
  getGivingSettings: (...args: unknown[]) => getGivingSettings(...args),
  updateGivingPage: (...args: unknown[]) => updateGivingPage(...args),
}));

const { GET, PUT } = await import("../route");

function sessionWithRole(role: Role, churchId = "church-1"): Session {
  return createSession({
    churchRoles: [
      {
        id: "role-1",
        churchId,
        role,
        ministryId: role === "MINISTER" ? "min-1" : null,
        church: { id: churchId, name: "ICC Rennes", slug: "icc-rennes" },
        departments: [],
      },
    ],
  });
}

function put(body: Record<string, unknown>) {
  return PUT(
    new Request("http://localhost/api/giving", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const validBody = {
  churchId: "church-1",
  enabled: true,
  onlineEnabled: false,
  transferEnabled: true,
  beneficiary: "ICC Rennes",
  iban: "FR76 3000 6000 0112 3456 7890 189",
  onsiteEnabled: false,
  taxReceiptEnabled: false,
};

describe("/api/giving (spec 065)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGivingSettings.mockResolvedValue({ churchId: "church-1" });
    updateGivingPage.mockImplementation(async (input) => input);
  });

  it.each(["MINISTER", "DEPARTMENT_HEAD", "STAR", "REPORTER", "DISCIPLE_MAKER", "PASTORAL_CARE_REFERENT"] as Role[])(
    "403 pour %s",
    async (role) => {
      currentSession = sessionWithRole(role);
      expect((await GET(new Request("http://localhost/api/giving?churchId=church-1"))).status).toBe(403);
      expect((await put(validBody)).status).toBe(403);
      expect(updateGivingPage).not.toHaveBeenCalled();
    }
  );

  it.each(["ADMIN", "SECRETARY", "ACCOUNTANT"] as Role[])("200 pour %s", async (role) => {
    currentSession = sessionWithRole(role);
    expect((await GET(new Request("http://localhost/api/giving?churchId=church-1"))).status).toBe(200);
    expect((await put(validBody)).status).toBe(200);
  });

  it("200 pour Super Admin, avec la session comme auteur", async () => {
    currentSession = createSuperAdminSession();
    expect((await put(validBody)).status).toBe(200);
    expect(updateGivingPage).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-1", iban: "FR7630006000011234567890189" }),
      { id: "user-1", name: "Test User" }
    );
  });

  it("GET exige churchId", async () => {
    currentSession = sessionWithRole("ADMIN");
    expect((await GET(new Request("http://localhost/api/giving"))).status).toBe(400);
  });

  it("400 sur un IBAN invalide, avant tout accès", async () => {
    currentSession = sessionWithRole("ADMIN");
    const res = await put({ ...validBody, iban: "FR7630006000011234567890188" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toContainEqual(expect.objectContaining({ field: "iban" }));
    expect(updateGivingPage).not.toHaveBeenCalled();
  });

  it("le churchId du corps fait autorité : Admin ailleurs, refusé ici", async () => {
    currentSession = sessionWithRole("ADMIN", "church-2");
    expect((await put(validBody)).status).toBe(403);
    expect(requireChurchPermission).toHaveBeenCalledWith("giving:manage", "church-1");
  });
});
