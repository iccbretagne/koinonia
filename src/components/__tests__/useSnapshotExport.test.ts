import { describe, it, expect } from "vitest";
import { fitImageInPage } from "../useSnapshotExport";

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
