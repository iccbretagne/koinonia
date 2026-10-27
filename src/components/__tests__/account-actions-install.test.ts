import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallTarget } from "@/lib/install/detect";

let detected: { target: InstallTarget; platform: "ios" | "android" | "desktop" } | null = null;
vi.mock("@/lib/install/use-install-target", () => ({ useInstallTarget: () => detected }));

const { default: AccountActions } = await import("../AccountActions");

const render = (variant: "menu" | "sheet") =>
  renderToStaticMarkup(
    createElement(AccountActions, {
      hasBothRoles: false,
      isInPastoralMode: false,
      signOutAction: async () => {},
      variant,
    })
  );

describe("menu du compte — « Installer l'application » (spec 070)", () => {
  beforeEach(() => {
    detected = null;
  });

  it.each(["menu", "sheet"] as const)("%s : absente avant la détection de l'appareil", (variant) => {
    expect(render(variant)).not.toContain("Installer l&#x27;application");
  });

  it.each(["menu", "sheet"] as const)("%s : absente dans l'application installée", (variant) => {
    detected = { target: "installed", platform: "android" };
    expect(render(variant)).not.toContain("Installer l&#x27;application");
  });

  it.each(["menu", "sheet"] as const)("%s : absente sur un navigateur non compatible", (variant) => {
    detected = { target: "unsupported", platform: "desktop" };
    expect(render(variant)).not.toContain("Installer l&#x27;application");
  });

  it.each(["menu", "sheet"] as const)("%s : iPhone, lien vers la page d'installation", (variant) => {
    detected = { target: "ios-safari", platform: "ios" };
    const html = render(variant);
    expect(html).toContain("Installer l&#x27;application");
    expect(html).toContain("Sur l&#x27;écran d&#x27;accueil de votre iPhone");
    expect(html).toContain('href="/installer"');
  });

  it.each(["menu", "sheet"] as const)("%s : installation native, bouton sans lien", (variant) => {
    detected = { target: "android-prompt", platform: "android" };
    const html = render(variant);
    expect(html).toContain("En un appui sur ce téléphone");
    expect(html).not.toContain('href="/installer"');
    expect(html).toMatch(/<button type="button"[^>]*>.*Installer l&#x27;application/);
  });

  it("la ligne suit le guide et précède la déconnexion", () => {
    detected = { target: "desktop-manual", platform: "desktop" };
    const html = render("menu");
    expect(html.indexOf("Guide d")).toBeLessThan(html.indexOf("Installer l&#x27;application"));
    expect(html.indexOf("Installer l&#x27;application")).toBeLessThan(html.indexOf("Se déconnecter"));
  });
});
