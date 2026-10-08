import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { resolvePhotoLink } = await import("../_photo-link");

const signUrl = vi.fn((key: string, filename: string) => Promise.resolve(`signed://${key}/${filename}`));
const options = (approvedOnly: boolean) => ({
  approvedOnly,
  signUrl,
  messages: { fileNotAvailable: "indisponible", fileNotApproved: "non validé", photoNotApproved: "photo non approuvée" },
});
const projectToken = { mediaProjectId: "proj-1", mediaEventId: null };
const eventToken = { mediaProjectId: null, mediaEventId: "evt-1" };

function file(status: string, overrides: object = {}) {
  return { id: "f1", filename: "a.png", mediaProjectId: "proj-1", status, versions: [{ originalKey: "orig/f1" }], ...overrides };
}

describe("resolvePhotoLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fichier de projet : lien signé sur la dernière version", async () => {
    prismaMock.mediaFile.findUnique.mockResolvedValue(file("IN_REVIEW") as never);
    await expect(resolvePhotoLink(projectToken, "f1", options(false))).resolves.toEqual({
      id: "f1",
      filename: "a.png",
      downloadUrl: "signed://orig/f1/a.png",
    });
  });

  it.each([
    ["inexistant", null, false, 404, "Fichier introuvable"],
    ["d'un autre projet", file("APPROVED", { mediaProjectId: "proj-2" }), false, 403, "Fichier hors périmètre"],
    ["brouillon", file("DRAFT"), false, 403, "indisponible"],
    ["non validé (lien restreint)", file("IN_REVIEW"), true, 403, "non validé"],
    ["sans version", file("APPROVED", { versions: [] }), false, 404, "Fichier S3 introuvable"],
  ])("fichier %s : refusé", async (_label, value, approvedOnly, statusCode, message) => {
    prismaMock.mediaFile.findUnique.mockResolvedValue(value as never);
    await expect(resolvePhotoLink(projectToken, "f1", options(approvedOnly))).rejects.toMatchObject({ statusCode, message });
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("photo d'événement : filtrée par l'événement du jeton, refusée si non approuvée sur un lien restreint", async () => {
    prismaMock.mediaPhoto.findFirst.mockResolvedValue({ id: "p1", filename: "p.jpg", originalKey: "orig/p1", status: "PENDING" } as never);
    await expect(resolvePhotoLink(eventToken, "p1", options(true))).rejects.toMatchObject({ statusCode: 403, message: "photo non approuvée" });
    await expect(resolvePhotoLink(eventToken, "p1", options(false))).resolves.toMatchObject({ downloadUrl: "signed://orig/p1/p.jpg" });
    expect(prismaMock.mediaPhoto.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", mediaEventId: "evt-1" } }));
  });

  it("jeton sans cible : photo introuvable", async () => {
    await expect(resolvePhotoLink({ mediaProjectId: null, mediaEventId: null }, "p1", options(false))).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
