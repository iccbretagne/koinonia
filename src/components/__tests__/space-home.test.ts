import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Camera, Headphones, LayoutGrid, Megaphone } from "lucide-react";
import SpaceHome, { cardIcon, statTone } from "../SpaceHome";

describe("SpaceHome (SpaceCard)", () => {
  it("choisit l'icône de la carte d'après sa destination", () => {
    expect(cardIcon("/medias/photos")).toBe(Camera);
    expect(cardIcon("/medias/reseaux-sociaux")).toBe(Megaphone);
    expect(cardIcon("/medias/audio/ecouter")).toBe(Headphones);
    expect(cardIcon("/autre")).toBe(LayoutGrid);
  });

  it("signale en warning ce qui attend, en neutre le reste et les zéros", () => {
    expect(statTone("3 en attente")).toBe("warning");
    expect(statTone("0 en attente")).toBe("neutral");
    expect(statTone("12 publié(s) (30 j)")).toBe("neutral");
  });

  it("rend une carte-lien sur les tokens, compteurs en StatusChip", () => {
    const html = renderToStaticMarkup(
      createElement(SpaceHome, { title: "Audio", cards: [{ href: "/medias/audio/production", title: "Production", stats: ["2 en attente"] }] })
    );
    expect(html).toContain('href="/medias/audio/production"');
    expect(html).toContain("bg-warning-soft");
    expect(html).not.toMatch(/gray-|icc-/);
  });
});
