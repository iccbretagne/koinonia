import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/integration", () => ({
  runInactivityNotifications: vi.fn().mockResolvedValue({}),
  runMsdpInactivityNotifications: vi.fn().mockResolvedValue({}),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
    buildPlanningDigestEmail: () => ({ subject: "subject", html: "<p>html</p>" }),
  };
});

const { POST } = await import("../route");

function cronRequest() {
  return new Request("http://localhost/api/cron", {
    method: "POST",
    headers: { authorization: "Bearer test-secret" },
  });
}

const auditEntry = {
  id: "audit-1",
  entityId: "ed-1",
  entityType: "Planning",
  createdAt: new Date(),
  user: { name: "Alice", displayName: null },
};

const eventDept = {
  id: "ed-1",
  event: { title: "Culte du dimanche", date: new Date() },
  department: { name: "Choristes" },
  plannings: [
    { status: "EN_SERVICE", member: { firstName: "Bob", lastName: "Martin" } },
  ],
};

describe("POST /api/cron — digest planning, emails multiples secrétariat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.test";
    prismaMock.event.findMany.mockResolvedValue([]); // pas de rappels
    prismaMock.church.update.mockResolvedValue({});
    prismaMock.auditLog.findMany.mockResolvedValue([auditEntry]);
    prismaMock.eventDepartment.findMany.mockResolvedValue([eventDept]);
  });

  it("envoie un seul digest à toutes les adresses secrétariat configurées", async () => {
    prismaMock.church.findMany
      .mockResolvedValueOnce([]) // runReminders : aucune église à relancer
      .mockResolvedValueOnce([
        { id: "church-1", name: "ICC Rennes", secretariatEmails: "sec@icc.fr, backup@icc.fr", planningDigestLastSentAt: null },
      ]);

    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["sec@icc.fr", "backup@icc.fr"] })
    );
  });

  it("n'envoie rien pour une église sans adresse secrétariat exploitable", async () => {
    prismaMock.church.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "church-1", name: "ICC Rennes", secretariatEmails: "", planningDigestLastSentAt: null },
      ]);

    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("continue de fonctionner avec une seule adresse configurée (non-régression)", async () => {
    prismaMock.church.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "church-1", name: "ICC Rennes", secretariatEmails: "sec@icc.fr", planningDigestLastSentAt: null },
      ]);

    const res = await POST(cronRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["sec@icc.fr"] }));
  });
});
