import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
let configured = true;
let cookieValue: string | undefined;

vi.mock("@/lib/auth", () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
vi.mock("@/lib/push/config", () => ({ isPushConfigured: () => configured }));
vi.mock("@/lib/push/subscriptions", () => ({
  PUSH_DEVICE_COOKIE: "koinonia-push-device",
  subscribeDevice: (...a: unknown[]) => mockSubscribe(...a),
  unsubscribeDevice: (...a: unknown[]) => mockUnsubscribe(...a),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

const { POST, DELETE } = await import("../route");

const valid = { endpoint: "https://push.example/abc", keys: { p256dh: "BPkey_-", auth: "auth-key" } };

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/notifications/push/subscriptions", {
    method,
    headers: { "Content-Type": "application/json", "user-agent": "UA" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/notifications/push/subscriptions (spec 068)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured = true;
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockSubscribe.mockResolvedValue({ id: "sub-1" });
  });

  it("enregistre l'appareil de l'appelant et pose le cookie httpOnly", async () => {
    const res = await POST(request("POST", valid));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "sub-1" });
    expect(mockSubscribe).toHaveBeenCalledWith("user-1", valid, "UA");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("koinonia-push-device=sub-1");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("401 sans session", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await POST(request("POST", valid))).status).toBe(401);
  });

  it.each([
    ["endpoint non https", { ...valid, endpoint: "http://push.example/abc" }],
    ["clés vides", { ...valid, keys: { p256dh: "", auth: "" } }],
    ["clé hors base64url", { ...valid, keys: { p256dh: "a b", auth: "x" } }],
  ])("400 : %s", async (_label, body) => {
    expect((await POST(request("POST", body))).status).toBe(400);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("503 sans clés VAPID", async () => {
    configured = false;
    expect((await POST(request("POST", valid))).status).toBe(503);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/notifications/push/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValue = undefined;
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockUnsubscribe.mockResolvedValue(undefined);
  });

  it("par endpoint : limité à l'appelant, 204 et cookie effacé", async () => {
    const res = await DELETE(request("DELETE", { endpoint: valid.endpoint }));
    expect(res.status).toBe(204);
    expect(mockUnsubscribe).toHaveBeenCalledWith("user-1", { endpoint: valid.endpoint });
    expect(res.headers.get("set-cookie") ?? "").toContain("koinonia-push-device=");
  });

  it("sans endpoint : l'appareil du cookie", async () => {
    cookieValue = "sub-9";
    expect((await DELETE(request("DELETE"))).status).toBe(204);
    expect(mockUnsubscribe).toHaveBeenCalledWith("user-1", { id: "sub-9" });
  });

  it("rien à désigner : 204 neutre", async () => {
    expect((await DELETE(request("DELETE", {}))).status).toBe(204);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("401 sans session", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await DELETE(request("DELETE", {}))).status).toBe(401);
  });
});
