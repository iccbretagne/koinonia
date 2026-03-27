import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/s3", () => ({ isS3Configured: vi.fn() }));
vi.mock("@/lib/backup", () => ({
  createBackup: vi.fn(),
  cleanupOldBackups: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  buildReminderEmail: vi.fn(),
}));

describe("POST /api/cron/backup — auth and S3 checks", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 when no Authorization header", async () => {
    const { POST } = await import("../backup/route");

    const request = new Request("http://localhost/api/cron/backup", {
      method: "POST",
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 401 when wrong Bearer token", async () => {
    const { POST } = await import("../backup/route");

    const request = new Request("http://localhost/api/cron/backup", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 503 when S3 is not configured", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    vi.mocked(isS3Configured).mockReturnValue(false);

    const { POST } = await import("../backup/route");

    const request = new Request("http://localhost/api/cron/backup", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await POST(request);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 200 on success", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    const { createBackup, cleanupOldBackups } = await import("@/lib/backup");

    vi.mocked(isS3Configured).mockReturnValue(true);
    vi.mocked(createBackup).mockResolvedValue({
      key: "backup-2026-03-27.sql.gz",
      sizeBytes: 1024,
      durationMs: 500,
    });
    vi.mocked(cleanupOldBackups).mockResolvedValue(0);

    const { POST } = await import("../backup/route");

    const request = new Request("http://localhost/api/cron/backup", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await POST(request);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backup).toBeDefined();
    expect(body.cleanedUp).toBe(0);
  });
});

describe("POST /api/cron/reminders — auth and processing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 when no Authorization header", async () => {
    const { POST } = await import("../reminders/route");

    const request = new Request("http://localhost/api/cron/reminders", {
      method: "POST",
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 401 when wrong Bearer token", async () => {
    const { POST } = await import("../reminders/route");

    const request = new Request("http://localhost/api/cron/reminders", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await POST(request);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 200 on success with empty events", async () => {
    prismaMock.event.findMany.mockResolvedValue([]);

    const { POST } = await import("../reminders/route");

    const request = new Request("http://localhost/api/cron/reminders", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await POST(request);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailsSent).toBe(0);
    expect(body.notificationsCreated).toBe(0);
  });
});
