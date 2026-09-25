import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  buildReminderEmail: vi.fn(),
  buildPlanningDigestEmail: vi.fn(),
  parseEmailList: vi.fn(() => []),
}));

/**
 * `/api/cron` (spec 038) : la route reste une adresse du noyau — elle répond toujours —
 * mais les traitements des modules `integration` et `jobs` doivent être conditionnés par
 * `registry.has(...)`. Contrôle par manipulation directe de `ENABLED_MODULES`, comme le
 * lirait un vrai process, plutôt que par mock de `@/lib/registry` (pour exercer le vrai
 * `boot()` — c'est lui qui doit faire foi).
 */
describe("POST /api/cron — conditionnement par module (spec 038)", () => {
  const originalEnabledModules = process.env.ENABLED_MODULES;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    prismaMock.church.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalEnabledModules === undefined) delete process.env.ENABLED_MODULES;
    else process.env.ENABLED_MODULES = originalEnabledModules;
  });

  async function postCron() {
    vi.resetModules();
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/cron", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
    return POST(request);
  }

  it("répond 200 et n'appelle ni integration ni care ni jobs quand ils sont désactivés", async () => {
    process.env.ENABLED_MODULES = "core,planning";
    vi.doMock("@/modules/integration", () => ({
      integrationBus: { on: vi.fn() },
      runInactivityNotifications: vi.fn(() => {
        throw new Error("ne devrait pas être appelé — module integration désactivé");
      }),
      runWaitingRelanceNotifications: vi.fn(() => {
        throw new Error("ne devrait pas être appelé — module integration désactivé");
      }),
    }));
    vi.doMock("@/modules/care", () => ({
      runMsdpInactivityNotifications: vi.fn(() => {
        throw new Error("ne devrait pas être appelé — module care désactivé");
      }),
      runCareRelances: vi.fn(() => {
        throw new Error("ne devrait pas être appelé — module care désactivé");
      }),
    }));
    vi.doMock("@/modules/jobs", () => ({
      runJobOffersLifecycle: vi.fn(() => {
        throw new Error("ne devrait pas être appelé — module jobs désactivé");
      }),
    }));

    const res = await postCron();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integrationInactivity).toBeNull();
    expect(body.msdpInactivity).toBeNull();
    expect(body.integrationRelance).toBeNull();
    expect(body.jobOffersLifecycle).toBeNull();
  });

  it("appelle integration, care et jobs quand ils sont actifs (comportement par défaut préservé)", async () => {
    delete process.env.ENABLED_MODULES;
    const runInactivityNotifications = vi.fn().mockResolvedValue({ sent: 0 });
    const runMsdpInactivityNotifications = vi.fn().mockResolvedValue({ sent: 0 });
    const runCareRelances = vi.fn().mockResolvedValue({ unassignedNotified: 0, unscheduledNotified: 0 });
    const runWaitingRelanceNotifications = vi.fn().mockResolvedValue({ notified: 0 });
    const runJobOffersLifecycle = vi.fn().mockResolvedValue({ processed: 0 });
    vi.doMock("@/modules/integration", () => ({
      integrationBus: { on: vi.fn() },
      runInactivityNotifications,
      runWaitingRelanceNotifications,
    }));
    vi.doMock("@/modules/care", () => ({ runMsdpInactivityNotifications, runCareRelances }));
    vi.doMock("@/modules/jobs", () => ({ runJobOffersLifecycle }));

    const res = await postCron();

    expect(res.status).toBe(200);
    expect(runInactivityNotifications).toHaveBeenCalledOnce();
    expect(runMsdpInactivityNotifications).toHaveBeenCalledOnce();
    expect(runCareRelances).toHaveBeenCalledOnce();
    expect(runWaitingRelanceNotifications).toHaveBeenCalledOnce();
    expect(runJobOffersLifecycle).toHaveBeenCalledOnce();
  });
});
