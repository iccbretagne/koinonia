/**
 * Tests — spec 025 (H-02) : périmètre des jetons de partage sur les routes photo.
 *
 * Une photo n'appartient jamais à un projet (MediaPhoto.mediaEventId est obligatoire).
 * Un jeton délégué à un projet, ou sans cible du tout, ne doit donc jamais accéder à une photo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const mockValidateMediaShareToken = vi.fn();

vi.mock("@/modules/media", () => ({
  validateMediaShareToken: (...args: unknown[]) => mockValidateMediaShareToken(...args),
  getSignedOriginalUrl: vi.fn().mockResolvedValue("https://example.com/original.jpg"),
  getSignedDownloadUrl: vi.fn().mockResolvedValue("https://example.com/download.jpg"),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET: validateGet, PATCH: validatePatch } = await import(
  "../validate/[token]/photo/[photoId]/route"
);
const { GET: galleryGet } = await import("../gallery/[token]/photo/[photoId]/route");
const { GET: downloadGet } = await import("../download/[token]/photo/[photoId]/route");

const makeParams = (token: string, photoId: string) => Promise.resolve({ token, photoId });

const eventToken = { id: "tok-1", type: "VALIDATOR" as const, mediaEventId: "evt-1" };
const projectToken = { id: "tok-2", type: "VALIDATOR" as const, mediaProjectId: "proj-1" };
const noTargetToken = { id: "tok-3", type: "VALIDATOR" as const };

const galleryEventToken = { id: "tok-4", type: "GALLERY" as const, mediaEventId: "evt-1", config: null };
const galleryProjectToken = { id: "tok-5", type: "GALLERY" as const, mediaProjectId: "proj-1", config: null };
const galleryNoTargetToken = { id: "tok-6", type: "GALLERY" as const, config: null };

const downloadEventToken = { id: "tok-7", type: "MEDIA" as const, mediaEventId: "evt-1" };
const downloadProjectToken = { id: "tok-8", type: "MEDIA" as const, mediaProjectId: "proj-1" };
const downloadNoTargetToken = { id: "tok-9", type: "MEDIA" as const };

describe("H-02 : périmètre des jetons sur les routes photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validate/[token]/photo/[photoId]", () => {
    it("jeton projet refusé en GET (aucune requête photo émise)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(projectToken);

      const res = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-of-another-church"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).not.toHaveBeenCalled();
    });

    it("jeton projet refusé en PATCH (aucune écriture émise)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(projectToken);

      const request = new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ status: "APPROVED" }),
      });
      const res = await validatePatch(request, {
        params: makeParams("tok", "photo-of-another-church"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.updateMany).not.toHaveBeenCalled();
    });

    it("jeton sans aucune cible refusé en GET et PATCH", async () => {
      mockValidateMediaShareToken.mockResolvedValue(noTargetToken);

      const resGet = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });
      expect(resGet.status).toBe(404);

      const resPatch = await validatePatch(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({ status: "APPROVED" }),
        }),
        { params: makeParams("tok", "photo-1") }
      );
      expect(resPatch.status).toBe(404);
    });

    it("jeton événement filtre la requête par son propre événement (photo d'un autre événement refusée)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(eventToken);
      prismaMock.mediaPhoto.findFirst.mockResolvedValue(null);

      const res = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-other-event"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "photo-other-event", mediaEventId: "evt-1" },
        })
      );
    });

    it("jeton événement autorise une photo de son propre événement (non-régression)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(eventToken);
      prismaMock.mediaPhoto.findFirst.mockResolvedValue({
        id: "photo-1",
        originalKey: "key.jpg",
        filename: "photo.jpg",
      } as never);

      const res = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(200);
    });

    it("refus hors périmètre et refus pour photo inexistante rendent le même statut et le même message", async () => {
      mockValidateMediaShareToken.mockResolvedValue(eventToken);
      prismaMock.mediaPhoto.findFirst.mockResolvedValue(null);
      const outOfScope = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-other-event"),
      });

      mockValidateMediaShareToken.mockResolvedValue(noTargetToken);
      const noTarget = await validateGet(new Request("http://localhost"), {
        params: makeParams("tok", "any-photo"),
      });

      expect(outOfScope.status).toBe(noTarget.status);
      expect(await outOfScope.json()).toEqual(await noTarget.json());
    });

    it("un refus PATCH ne déclenche aucune transition d'état de l'événement", async () => {
      mockValidateMediaShareToken.mockResolvedValue(eventToken);
      prismaMock.mediaPhoto.updateMany.mockResolvedValue({ count: 0 } as never);

      await validatePatch(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({ status: "APPROVED" }),
        }),
        { params: makeParams("tok", "missing") }
      );

      expect(prismaMock.mediaEvent.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("gallery/[token]/photo/[photoId]", () => {
    it("jeton sans aucune cible refusé", async () => {
      mockValidateMediaShareToken.mockResolvedValue(galleryNoTargetToken);

      const res = await galleryGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).not.toHaveBeenCalled();
    });

    it("jeton projet passe par la branche fichier, jamais par la branche photo", async () => {
      mockValidateMediaShareToken.mockResolvedValue(galleryProjectToken);
      prismaMock.mediaFile.findUnique.mockResolvedValue(null);

      const res = await galleryGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).not.toHaveBeenCalled();
    });

    it("jeton événement autorise sa propre photo (non-régression)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(galleryEventToken);
      prismaMock.mediaPhoto.findFirst.mockResolvedValue({
        id: "photo-1",
        filename: "photo.jpg",
        originalKey: "key.jpg",
        status: "APPROVED",
      } as never);

      const res = await galleryGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("download/[token]/photo/[photoId]", () => {
    it("jeton sans aucune cible refusé", async () => {
      mockValidateMediaShareToken.mockResolvedValue(downloadNoTargetToken);

      const res = await downloadGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).not.toHaveBeenCalled();
    });

    it("jeton projet passe par la branche fichier, jamais par la branche photo", async () => {
      mockValidateMediaShareToken.mockResolvedValue(downloadProjectToken);
      prismaMock.mediaFile.findUnique.mockResolvedValue(null);

      const res = await downloadGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(404);
      expect(prismaMock.mediaPhoto.findFirst).not.toHaveBeenCalled();
    });

    it("jeton événement autorise sa propre photo approuvée (non-régression)", async () => {
      mockValidateMediaShareToken.mockResolvedValue(downloadEventToken);
      prismaMock.mediaPhoto.findFirst.mockResolvedValue({
        id: "photo-1",
        filename: "photo.jpg",
        originalKey: "key.jpg",
        status: "APPROVED",
      } as never);

      const res = await downloadGet(new Request("http://localhost"), {
        params: makeParams("tok", "photo-1"),
      });

      expect(res.status).toBe(200);
    });
  });
});
