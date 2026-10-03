import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// La collecte des disponibilités (spec 058) a ses propres tests : ici on isole le cron.
vi.mock("@/modules/planning/services/availability/collection", () => ({
  runAvailabilityTasks: vi.fn().mockResolvedValue({ opened: 0, openingNotified: 0, asksSent: 0, relances: 0 }),
}));
vi.mock("@/modules/integration", () => ({
  integrationBus: { on: vi.fn() },
  runInactivityNotifications: vi.fn().mockResolvedValue({}),
  runWaitingRelanceNotifications: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/modules/care", () => ({
  runMsdpInactivityNotifications: vi.fn().mockResolvedValue({}),
  runCareRelances: vi.fn().mockResolvedValue({}),
}));
const mockRunJobOffersLifecycle = vi.fn().mockResolvedValue({ archived: 0, renewalsSent: 0, emailFailures: 0 });
vi.mock("@/modules/jobs", () => ({
  runJobOffersLifecycle: (...args: unknown[]) => mockRunJobOffersLifecycle(...args),
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
    // Planificateur (ADR-0021) : aucune tâche encore passée, donc toutes dues.
    prismaMock.cronTaskRun.findMany.mockResolvedValue([]);
    prismaMock.cronTaskRun.createMany.mockResolvedValue({ count: 1 });
    prismaMock.cronTaskRun.update.mockResolvedValue({});
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

  it("exécute la tâche de cycle de vie des offres et remonte son compte rendu", async () => {
    prismaMock.church.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockRunJobOffersLifecycle.mockResolvedValueOnce({ archived: 2, renewalsSent: 5, emailFailures: 1 });

    const res = await POST(cronRequest());
    const body = await res.json();

    expect(mockRunJobOffersLifecycle).toHaveBeenCalledTimes(1);
    expect(body.jobOffersLifecycle).toEqual({ archived: 2, renewalsSent: 5, emailFailures: 1 });
  });

  it("planificateur : le digest passé il y a 10 minutes n'est pas relancé par l'appel de 5 minutes", async () => {
    prismaMock.cronTaskRun.findMany.mockResolvedValue([
      { key: "planning-digest", lastStartedAt: new Date(Date.now() - 10 * 60_000) },
    ]);
    prismaMock.church.findMany.mockResolvedValue([
      { id: "church-1", name: "ICC Rennes", secretariatEmails: "sec@icc.fr", planningDigestLastSentAt: null },
    ]);

    const res = await POST(cronRequest());
    const body = await res.json();

    expect(body.tasks["planning-digest"]).toBe("not-due");
    expect(body.planningDigest).toBeNull();
    expect(mockSendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: ["sec@icc.fr"] }));
  });
});
