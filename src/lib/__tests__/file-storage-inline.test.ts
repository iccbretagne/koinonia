import { describe, it, expect, vi } from "vitest";

/** Aperçu des pièces sans téléchargement (spec 089) : `inline` seulement pour un type sûr. */
vi.stubEnv("ACCOUNTING_S3_BUCKET", "");
const { getFileUrl } = await import("../file-storage");

describe("getFileUrl — inline", () => {
  it("affiche un PDF ou une image quand c'est demandé", async () => {
    expect(await getFileUrl("k", "f.pdf", { inline: true, mimeType: "application/pdf" })).toContain("inline=1");
    expect(await getFileUrl("k", "f.png", { inline: true, mimeType: "image/png" })).toContain("inline=1");
  });

  it("télécharge par défaut, et pour tout autre type", async () => {
    expect(await getFileUrl("k", "f.pdf")).not.toContain("inline=1");
    expect(await getFileUrl("k", "f.svg", { inline: true, mimeType: "image/svg+xml" })).not.toContain("inline=1");
    expect(await getFileUrl("k", "f.html", { inline: true, mimeType: "text/html" })).not.toContain("inline=1");
  });
});
