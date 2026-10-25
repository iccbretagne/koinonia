import { describe, it, expect } from "vitest";
import { isGuardedNavigation, type AnchorLike, type ClickLike } from "../leave-guard";

const location = { origin: "https://koinonia.test", pathname: "/dons" };
const click: ClickLike = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

function anchor(href: string, attrs: Record<string, string> = {}): AnchorLike {
  return { href, getAttribute: (name) => attrs[name] ?? null };
}

describe("garde à la sortie (spec 067)", () => {
  it("garde un clic gauche sur un lien interne", () => {
    expect(isGuardedNavigation(click, anchor("https://koinonia.test/accueil"), location)).toBe(true);
    expect(isGuardedNavigation(click, anchor("https://koinonia.test/dons/slide"), location)).toBe(true);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["clic du milieu", { button: 1 }],
    ["clic déjà annulé", { defaultPrevented: true }],
  ])("laisse passer : %s", (_, patch) => {
    expect(isGuardedNavigation({ ...click, ...patch }, anchor("https://koinonia.test/accueil"), location)).toBe(false);
  });

  it("laisse passer un nouvel onglet, un téléchargement, un autre site, le même écran", () => {
    expect(isGuardedNavigation(click, anchor("https://koinonia.test/donner/rennes", { target: "_blank" }), location)).toBe(false);
    expect(isGuardedNavigation(click, anchor("https://koinonia.test/export.png", { download: "" }), location)).toBe(false);
    expect(isGuardedNavigation(click, anchor("https://exemple.fr/"), location)).toBe(false);
    expect(isGuardedNavigation(click, anchor("https://koinonia.test/dons?support=slide"), location)).toBe(false);
  });
});
