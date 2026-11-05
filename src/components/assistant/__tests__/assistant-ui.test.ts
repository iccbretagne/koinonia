import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/planning", useRouter: () => ({ refresh: vi.fn() }) }));

const { default: AssistantAvatar, assistantImage } = await import("../AssistantAvatar");
const { default: AssistantLauncher } = await import("../AssistantLauncher");
const { default: AssistantPanel } = await import("../AssistantPanel");

describe("personnage de l'assistant (spec 075)", () => {
  it("affiche Nia au repos, avec l'image « yeux fermés » superposée pour le clignement", () => {
    const html = renderToStaticMarkup(createElement(AssistantAvatar, { persona: "NIA", size: 44 }));
    expect(html).toContain("/assistant/nia/repos-256.webp");
    expect(html).toContain("/assistant/nia/repos-yeux-fermes-256.webp");
    expect(html).toContain('alt="Nia souriante"');
    expect(html).toContain("k-assistant-blink");
  });

  it("change d'expression, sans clignement hors du repos, et accorde le texte pour Koï", () => {
    const html = renderToStaticMarkup(createElement(AssistantAvatar, { persona: "KOI", expression: "desole", size: 200 }));
    expect(html).toContain("/assistant/koi/desole-512.webp");
    expect(html).toContain('alt="Koï est désolé"');
    expect(html).not.toContain("yeux-fermes");
  });

  it("choisit la résolution de l'icône selon la taille affichée", () => {
    expect(assistantImage("NIA", "icone", 32)).toBe("/assistant/nia/icone-64.webp");
    expect(assistantImage("KOI", "icone", 40)).toBe("/assistant/koi/icone-128.webp");
  });

  it("chaque image du personnage existe dans public/assistant", () => {
    for (const persona of ["nia", "koi"]) {
      for (const name of ["repos", "repos-yeux-fermes", "bonjour", "reflechit", "content", "desole"]) {
        for (const size of [256, 512]) {
          expect(() => readFileSync(path.join(process.cwd(), `public/assistant/${persona}/${name}-${size}.webp`))).not.toThrow();
        }
      }
    }
  });

  it("ne s'anime pas quand l'appareil demande de réduire les animations", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.k-assistant-blink, \.k-assistant-float, \.k-assistant-fade \{ animation: none !important; \}/);
  });
});

describe("bouton d'aide (spec 075)", () => {
  it("mène au guide quand l'assistant est inactif", () => {
    const html = renderToStaticMarkup(createElement(AssistantLauncher, { enabled: false, persona: "NIA", firstName: "Marie" }));
    expect(html).toContain('href="/guide"');
    expect(html).not.toContain("Demander à");
  });

  it("présente le personnage choisi quand l'assistant est actif, panneau fermé", () => {
    const html = renderToStaticMarkup(createElement(AssistantLauncher, { enabled: true, persona: "KOI", firstName: "Marie" }));
    expect(html).toContain("Aide : demander à Koï");
    expect(html).toContain("/assistant/koi/icone-");
    expect(html).not.toContain("<dialog");
  });

  it("le panneau ne promet rien de conservé et propose le guide", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantPanel, { persona: "NIA", firstName: "Marie", screen: "/planning", onClose: () => undefined })
    );
    expect(html).toContain("Bonjour Marie ! Je suis Nia.");
    expect(html).toContain("Rien n&#x27;est conservé à la fermeture.");
    expect(html).toContain("/assistant/nia/bonjour-");
    expect(html).toContain('href="/guide"');
  });
});
