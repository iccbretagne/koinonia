import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockUnsubscribe = vi.fn();
const store = { get: vi.fn(), delete: vi.fn() };
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("../subscriptions", () => ({
  PUSH_DEVICE_COOKIE: "koinonia-push-device",
  unsubscribeDevice: (...a: unknown[]) => mockUnsubscribe(...a),
}));

const { forgetPushDeviceOnSignOut } = await import("../sign-out");

describe("forgetPushDeviceOnSignOut (spec 068)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockUnsubscribe.mockResolvedValue(undefined);
  });

  it("oublie l'appareil du cookie pour le compte connecté, puis efface le cookie", async () => {
    store.get.mockReturnValue({ value: "sub-1" });
    await forgetPushDeviceOnSignOut();
    expect(mockUnsubscribe).toHaveBeenCalledWith("u1", { id: "sub-1" });
    expect(store.delete).toHaveBeenCalledWith("koinonia-push-device");
  });

  it("sans cookie : rien à faire", async () => {
    store.get.mockReturnValue(undefined);
    await forgetPushDeviceOnSignOut();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("ne fait jamais échouer la déconnexion", async () => {
    store.get.mockReturnValue({ value: "sub-1" });
    mockUnsubscribe.mockRejectedValue(new Error("db down"));
    await expect(forgetPushDeviceOnSignOut()).resolves.toBeUndefined();
  });
});
