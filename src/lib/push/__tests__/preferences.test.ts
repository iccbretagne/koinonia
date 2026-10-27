import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { resolvePushPreference, pushAllowedByUser, upsertPushPreferences, PUSH_GLOBAL_DOMAIN } = await import("../preferences");

describe("resolvePushPreference (spec 068)", () => {
  it("interrupteur général coupé : jamais", () => {
    expect(resolvePushPreference({ globalEnabled: false, domainPreference: true })).toBe(false);
  });
  it("préférence explicite du domaine", () => {
    expect(resolvePushPreference({ globalEnabled: true, domainPreference: false })).toBe(false);
    expect(resolvePushPreference({ globalEnabled: true, domainPreference: true })).toBe(true);
  });
  it("domaine jamais réglé : activé", () => {
    expect(resolvePushPreference({ globalEnabled: true, domainPreference: undefined })).toBe(true);
  });
});

describe("pushAllowedByUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("combine interrupteur général et domaine, par utilisateur", async () => {
    prismaMock.notificationPushPreference.findMany.mockResolvedValue([
      { userId: "a", domain: PUSH_GLOBAL_DOMAIN, enabled: false },
      { userId: "b", domain: "planning", enabled: false },
      { userId: "c", domain: "planning", enabled: true },
    ]);
    const result = await pushAllowedByUser(["a", "b", "c", "d"], "planning");
    expect(Object.fromEntries(result)).toEqual({ a: false, b: false, c: true, d: true });
  });
});

describe("upsertPushPreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'écrit rien sans entrée", async () => {
    await upsertPushPreferences("u", []);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("upsert une ligne par domaine", async () => {
    prismaMock.notificationPushPreference.upsert.mockResolvedValue({});
    await upsertPushPreferences("u", [[PUSH_GLOBAL_DOMAIN, true], ["care", false]]);
    expect(prismaMock.notificationPushPreference.upsert).toHaveBeenCalledWith({
      where: { userId_domain: { userId: "u", domain: "care" } },
      update: { enabled: false },
      create: { userId: "u", domain: "care", enabled: false },
    });
    expect(prismaMock.notificationPushPreference.upsert).toHaveBeenCalledTimes(2);
  });
});
