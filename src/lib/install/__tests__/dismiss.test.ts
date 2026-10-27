import { describe, it, expect } from "vitest";
import { dismissInstallCard, INSTALL_DISMISS_KEY, isInstallCardDismissed } from "../dismiss";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("« Plus tard » sur la carte d'installation (spec 070)", () => {
  it("visible tant que rien n'est masqué", () => {
    expect(isInstallCardDismissed(new Date(), memoryStore())).toBe(false);
  });

  it("masquée 30 jours, puis à nouveau visible", () => {
    const store = memoryStore();
    const now = new Date("2026-10-27T10:00:00Z");
    dismissInstallCard(now, store);
    expect(store.data.has(INSTALL_DISMISS_KEY)).toBe(true);
    expect(isInstallCardDismissed(new Date(now.getTime() + 29 * DAY), store)).toBe(true);
    expect(isInstallCardDismissed(new Date(now.getTime() + 31 * DAY), store)).toBe(false);
  });

  it("stockage indisponible : visible, sans erreur", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => dismissInstallCard(new Date(), broken)).not.toThrow();
    expect(isInstallCardDismissed(new Date(), broken)).toBe(false);
    expect(isInstallCardDismissed(new Date(), null)).toBe(false);
  });
});
