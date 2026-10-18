import { describe, it, expect } from "vitest";
import { fitImageInPage, prepareForCapture } from "../useSnapshotExport";

describe("fitImageInPage", () => {
  it("image moins haute que la page : pleine largeur, calée en haut", () => {
    expect(fitImageInPage(210, 297, 1000, 500)).toEqual({ x: 0, width: 210, height: 105 });
  });

  it("image plus haute que la page : réduite à la hauteur et centrée horizontalement", () => {
    const { x, width, height } = fitImageInPage(297, 210, 1000, 1000);
    expect(height).toBe(210);
    expect(width).toBe(210);
    expect(x).toBe(43.5);
  });
});

describe("prepareForCapture", () => {
  const target = (theme?: string) => ({
    style: { width: "100%", transform: "scale(0.5)" },
    dataset: theme === undefined ? {} : { theme } as Record<string, string | undefined>,
  });

  it("force le thème clair par défaut, puis rétablit l'état d'origine", () => {
    const el = target();
    const restore = prepareForCapture(el, { captureWidth: "800px" });
    expect(el.dataset.theme).toBe("light");
    expect(el.style).toEqual({ width: "800px", transform: "none" });
    restore();
    expect(el.dataset).toEqual({});
    expect(el.style).toEqual({ width: "100%", transform: "scale(0.5)" });
  });

  it("thème sombre demandé (slide de dons, spec 065), attribut d'origine conservé", () => {
    const el = target("dark");
    const restore = prepareForCapture(el, { captureWidth: "1920px", theme: "dark" });
    expect(el.dataset.theme).toBe("dark");
    restore();
    expect(el.dataset.theme).toBe("dark");
  });
});
