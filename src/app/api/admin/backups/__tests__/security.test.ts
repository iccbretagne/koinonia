import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSuperAdminSession } from "@/__mocks__/auth";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/s3", () => ({ isS3Configured: vi.fn() }));
vi.mock("@/lib/backup", () => ({ createBackup: vi.fn(), listBackups: vi.fn() }));
vi.mock("@/lib/restore", () => ({ restoreBackup: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

const { GET, POST } = await import("../route");
const { POST: POST_RESTORE } = await import("../restore/route");

describe("GET /api/admin/backups — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await GET();

    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/backups — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const res = await POST();

    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/backups/restore — security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(createSuperAdminSession());
  });

  it("returns 401 when not authenticated", async () => {
    mockRequirePermission.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { isS3Configured } = await import("@/lib/s3");
    vi.mocked(isS3Configured).mockReturnValue(true);

    const request = new Request("http://localhost/api/admin/backups/restore", {
      method: "POST",
      body: JSON.stringify({ key: "backups/2024-01-01.sql.gz" }),
    });

    const res = await POST_RESTORE(request);

    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid key format (path traversal attempt)", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    vi.mocked(isS3Configured).mockReturnValue(true);

    const request = new Request("http://localhost/api/admin/backups/restore", {
      method: "POST",
      body: JSON.stringify({ key: "../../etc/passwd" }),
    });

    const res = await POST_RESTORE(request);

    expect(res.status).toBe(400);
  });

  it("returns 400 with key missing .sql.gz suffix", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    vi.mocked(isS3Configured).mockReturnValue(true);

    const request = new Request("http://localhost/api/admin/backups/restore", {
      method: "POST",
      body: JSON.stringify({ key: "backups/2024-01-01.sql" }),
    });

    const res = await POST_RESTORE(request);

    expect(res.status).toBe(400);
  });

  it("returns 404 when backup doesn't exist", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    const { listBackups } = await import("@/lib/backup");
    vi.mocked(isS3Configured).mockReturnValue(true);
    vi.mocked(listBackups).mockResolvedValue([]);

    const request = new Request("http://localhost/api/admin/backups/restore", {
      method: "POST",
      body: JSON.stringify({ key: "backups/2024-01-01.sql.gz" }),
    });

    const res = await POST_RESTORE(request);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 200 on valid restore", async () => {
    const { isS3Configured } = await import("@/lib/s3");
    const { listBackups } = await import("@/lib/backup");
    const { restoreBackup } = await import("@/lib/restore");
    vi.mocked(isS3Configured).mockReturnValue(true);
    vi.mocked(listBackups).mockResolvedValue([
      { key: "backups/2024-01-01.sql.gz", size: 1024, lastModified: new Date() },
    ]);
    vi.mocked(restoreBackup).mockResolvedValue({ durationMs: 1500 });

    const request = new Request("http://localhost/api/admin/backups/restore", {
      method: "POST",
      body: JSON.stringify({ key: "backups/2024-01-01.sql.gz" }),
    });

    const res = await POST_RESTORE(request);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.durationMs).toBe(1500);
  });
});
