import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockIsDevLoginEnabled = vi.fn();
vi.mock("@/lib/auth", () => ({
  isDevLoginEnabled: (...args: unknown[]) => mockIsDevLoginEnabled(...args),
  SESSION_COOKIE_NAME: "authjs.session-token",
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST } = await import("../route");

function postForm(devUserKey?: string) {
  const formData = new FormData();
  if (devUserKey !== undefined) formData.set("devUserKey", devUserKey);
  return POST(
    new Request("http://localhost/api/auth/dev-login", { method: "POST", body: formData })
  );
}

describe("POST /api/auth/dev-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when dev login is disabled (e.g. production)", async () => {
    mockIsDevLoginEnabled.mockReturnValue(false);

    const res = await postForm("super-admin");

    expect(res.status).toBe(404);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("redirects to the login page when the account key is unknown", async () => {
    mockIsDevLoginEnabled.mockReturnValue(true);

    const res = await postForm("does-not-exist");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("redirects to the login page when the seeded user does not exist yet", async () => {
    mockIsDevLoginEnabled.mockReturnValue(true);
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await postForm("super-admin");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it("creates a session and sets the session cookie for a valid dev account", async () => {
    mockIsDevLoginEnabled.mockReturnValue(true);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", email: "super.admin@dev.local" });
    prismaMock.session.create.mockResolvedValue({});

    const res = await postForm("super-admin");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" }),
      })
    );
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("authjs.session-token=");
  });
});
