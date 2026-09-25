import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  resolveEmailPreference,
  getPreferencesView,
  getVisibleDomainKeys,
  updatePreferences,
  GLOBAL_DOMAIN,
} from "../notification-preferences";

describe("resolveEmailPreference", () => {
  it("interrupteur général coupé → false, même si le domaine est explicitement activé", () => {
    expect(
      resolveEmailPreference({ globalEnabled: false, domainPreference: true, defaultEmail: true })
    ).toBe(false);
  });

  it("préférence explicite du domaine prioritaire sur defaultEmail", () => {
    expect(
      resolveEmailPreference({ globalEnabled: true, domainPreference: false, defaultEmail: true })
    ).toBe(false);
    expect(
      resolveEmailPreference({ globalEnabled: true, domainPreference: true, defaultEmail: false })
    ).toBe(true);
  });

  it("à défaut de préférence explicite, retombe sur defaultEmail du domaine", () => {
    expect(
      resolveEmailPreference({ globalEnabled: true, domainPreference: undefined, defaultEmail: true })
    ).toBe(true);
    expect(
      resolveEmailPreference({ globalEnabled: true, domainPreference: undefined, defaultEmail: false })
    ).toBe(false);
  });
});

describe("getPreferencesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([]);
  });

  it("un rôle sans care:qualify/care:view ne voit pas le domaine « care », mais voit « account » (toujours visible) et « jobs » (jobs:view)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "star@example.com" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "STAR" }]);

    const view = await getPreferencesView("u1");
    const keys = view.domains.map((d) => d.key);

    expect(keys).toContain("account");
    expect(keys).toContain("jobs");
    expect(keys).not.toContain("care");
  });

  it("un domaine déjà reçu en historique reste visible même sans la permission qui le donnerait normalement", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "star@example.com" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "STAR" }]);
    prismaMock.notification.findMany.mockResolvedValue([{ domain: "care" }]);

    const view = await getPreferencesView("u1");
    expect(view.domains.map((d) => d.key)).toContain("care");
  });

  it("hasEmail reflète l'adresse du compte", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: null });
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    const view = await getPreferencesView("u1");
    expect(view.hasEmail).toBe(false);
  });

  it("emailEnabled est activé par défaut en l'absence de ligne pour le domaine global", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "a@example.com" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);

    const view = await getPreferencesView("u1");
    expect(view.emailEnabled).toBe(true);
  });

  it("domaine jobs : préférence générique indépendante de JobNotificationSubscription (jamais consulté)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "star@example.com" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "STAR" }]);

    await getPreferencesView("u1");

    expect(prismaMock.jobNotificationSubscription.findMany).not.toHaveBeenCalled();
    expect(prismaMock.jobNotificationSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("une préférence explicite enregistrée l'emporte sur defaultEmail du domaine", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: "a@example.com" });
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "SUPER_ADMIN" }]);
    // "rooms" a defaultEmail: false — on l'active explicitement.
    prismaMock.notificationEmailPreference.findMany.mockResolvedValue([
      { userId: "u1", domain: "rooms", enabled: true },
    ]);

    const view = await getPreferencesView("u1");
    const rooms = view.domains.find((d) => d.key === "rooms");
    expect(rooms?.enabled).toBe(true);
  });
});

describe("getVisibleDomainKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.findMany.mockResolvedValue([]);
  });

  it("retourne le même périmètre que getPreferencesView, sans charger l'adresse email ni les préférences", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "SUPER_ADMIN" }]);

    const keys = await getVisibleDomainKeys("u1");

    expect(keys.has("account")).toBe(true);
    expect(keys.has("care")).toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.notificationEmailPreference.findMany).not.toHaveBeenCalled();
  });
});

describe("updatePreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notificationEmailPreference.upsert.mockResolvedValue({});
  });

  it("upsert une ligne par clé fournie, interrupteur général compris", async () => {
    await updatePreferences("u1", { emailEnabled: false, domains: { care: true } });

    expect(prismaMock.notificationEmailPreference.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.notificationEmailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_domain: { userId: "u1", domain: GLOBAL_DOMAIN } },
        update: { enabled: false },
        create: { userId: "u1", domain: GLOBAL_DOMAIN, enabled: false },
      })
    );
    expect(prismaMock.notificationEmailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_domain: { userId: "u1", domain: "care" } },
      })
    );
  });

  it("le domaine jobs s'écrit comme tout autre domaine, sans jamais toucher à JobNotificationSubscription", async () => {
    await updatePreferences("u1", { domains: { jobs: false } });

    expect(prismaMock.notificationEmailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_domain: { userId: "u1", domain: "jobs" } } })
    );
    expect(prismaMock.jobNotificationSubscription.update).not.toHaveBeenCalled();
    expect(prismaMock.jobNotificationSubscription.upsert).not.toHaveBeenCalled();
  });

  it("aucune entrée fournie → aucune écriture", async () => {
    await updatePreferences("u1", {});
    expect(prismaMock.notificationEmailPreference.upsert).not.toHaveBeenCalled();
  });
});
