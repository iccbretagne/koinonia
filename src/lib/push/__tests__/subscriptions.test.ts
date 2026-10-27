import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const loggerInfo = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { info: (...a: unknown[]) => loggerInfo(...a), warn: vi.fn(), error: vi.fn() } }));

const { subscribeDevice, unsubscribeDevice, deviceLabel, endpointHash } = await import("../subscriptions");

const input = { endpoint: "https://push.example/abc", keys: { p256dh: "BPkey", auth: "authkey" } };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("deviceLabel", () => {
  it.each([
    [IPHONE, "iPhone · Safari"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "Android · Chrome"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "Windows · Edge"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:131.0) Gecko/20100101 Firefox/131.0", "Mac · Firefox"],
    [null, null],
    ["curl/8", null],
  ])("%s → %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});

describe("subscribeDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: "sub-1" });
  });

  it("enregistre l'appareil par empreinte d'endpoint, avec son libellé", async () => {
    prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
    await expect(subscribeDevice("u1", input, IPHONE)).resolves.toEqual({ id: "sub-1" });
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpointHash: endpointHash(input.endpoint) },
        create: expect.objectContaining({ userId: "u1", endpointHash: endpointHash(input.endpoint), label: "iPhone · Safari" }),
        update: expect.objectContaining({ userId: "u1", p256dh: "BPkey", auth: "authkey" }),
      })
    );
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  it("réattribue l'appareil d'un autre compte, et le journalise", async () => {
    prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: "sub-1", userId: "ancien" });
    await subscribeDevice("u1", input, null);
    expect(loggerInfo).toHaveBeenCalledWith(expect.objectContaining({ fromUserId: "ancien", toUserId: "u1" }), expect.any(String));
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ userId: "u1" }) }));
  });
});

describe("unsubscribeDevice", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne supprime que les abonnements de l'appelant", async () => {
    await unsubscribeDevice("u1", { id: "sub-9" });
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "sub-9", userId: "u1" } });
    await unsubscribeDevice("u1", { endpoint: input.endpoint });
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenLastCalledWith({
      where: { endpointHash: endpointHash(input.endpoint), userId: "u1" },
    });
  });
});
