import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/planning";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ refresh: vi.fn() }) }));

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
  it("n'affiche aucune bulle quand l'assistant est inactif", () => {
    expect(renderToStaticMarkup(createElement(AssistantLauncher, { enabled: false, persona: "NIA", firstName: "Marie" }))).toBe("");
  });

  it("flotte en bas à droite avec le personnage choisi, au-dessus de la barre du bas, panneau fermé", () => {
    pathname = "/planning";
    const html = renderToStaticMarkup(createElement(AssistantLauncher, { enabled: true, persona: "KOI", firstName: "Marie" }));
    expect(html).toContain("Aide : demander à Koï");
    expect(html).toContain("Réduire Koï");
    expect(html).toContain("/assistant/koi/icone-");
    expect(html).toMatch(/fixed right-0[^"]*bottom-\[calc\(64px\+env\(safe-area-inset-bottom\)\+16px\)\]/);
    expect(html).not.toContain("<dialog");
  });

  it("se retire des écrans de terrain de la billetterie", () => {
    pathname = "/billetterie/evt-1/controle";
    expect(renderToStaticMarkup(createElement(AssistantLauncher, { enabled: true, persona: "NIA", firstName: null }))).toBe("");
    pathname = "/planning";
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

describe("panneau de l'assistant et clavier virtuel", () => {
  it("sans clavier : rien à corriger", async () => {
    const { keyboardBox } = await import("../keyboard-box");
    expect(keyboardBox({ height: 844, offsetTop: 0 }, 844)).toBeNull();
  });
  it("clavier ouvert : hauteur visible et décalage du défilement", async () => {
    const { keyboardBox } = await import("../keyboard-box");
    expect(keyboardBox({ height: 508.4, offsetTop: 0 }, 844)).toEqual({ height: 508, top: 0 });
    expect(keyboardBox({ height: 508, offsetTop: 290.6 }, 844)).toEqual({ height: 508, top: 291 });
  });
});
