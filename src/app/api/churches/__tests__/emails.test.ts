import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSuperAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { PUT } = await import("../[churchId]/route");

function putRequest(body: unknown) {
  return new Request("http://localhost/api/churches/church-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const params = Promise.resolve({ churchId: "church-1" });

describe("PUT /api/churches/[churchId] — emails multiples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createSuperAdminSession());
  });

  it("rejette une adresse email invalide dans accountingEmails", async () => {
    const res = await PUT(
      putRequest({
        name: "ICC Rennes",
        slug: "icc-rennes",
        secretariatEmails: [],
        accountingEmails: ["pas-un-email"],
      }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(prismaMock.church.update).not.toHaveBeenCalled();
  });

  it("rejette une adresse email invalide dans secretariatEmails", async () => {
    const res = await PUT(
      putRequest({
        name: "ICC Rennes",
        slug: "icc-rennes",
        secretariatEmails: ["pas-un-email"],
        accountingEmails: [],
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("accepte un tableau vide et efface les adresses", async () => {
    prismaMock.church.update.mockResolvedValue({
      id: "church-1",
      secretariatEmails: null,
      accountingEmails: null,
    });

    const res = await PUT(
      putRequest({ name: "ICC Rennes", slug: "icc-rennes", secretariatEmails: [], accountingEmails: [] }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(prismaMock.church.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secretariatEmails: null, accountingEmails: null }),
      })
    );
    const json = await res.json();
    expect(json.secretariatEmails).toEqual([]);
    expect(json.accountingEmails).toEqual([]);
  });

  it("écrit plusieurs adresses déduplique et les relit sous forme de tableau", async () => {
    prismaMock.church.update.mockResolvedValue({
      id: "church-1",
      secretariatEmails: "sec@icc.fr, backup@icc.fr",
      accountingEmails: "compta@icc.fr",
    });

    const res = await PUT(
      putRequest({
        name: "ICC Rennes",
        slug: "icc-rennes",
        secretariatEmails: ["sec@icc.fr", "backup@icc.fr", "sec@icc.fr"],
        accountingEmails: ["compta@icc.fr"],
      }),
      { params }
    );

    expect(res.status).toBe(200);
    expect(prismaMock.church.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secretariatEmails: "sec@icc.fr, backup@icc.fr",
          accountingEmails: "compta@icc.fr",
        }),
      })
    );
    const json = await res.json();
    expect(json.secretariatEmails).toEqual(["sec@icc.fr", "backup@icc.fr"]);
    expect(json.accountingEmails).toEqual(["compta@icc.fr"]);
  });
});
