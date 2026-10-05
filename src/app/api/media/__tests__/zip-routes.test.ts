/**
 * Tests — routes ZIP des partages (download/[token]/zip et collection/[token]/zip).
 *
 * L'archive est produite en tâche de fond après le retour de la réponse : un échec de
 * finalisation doit faire échouer le flux téléchargé, pas rester une promesse rejetée non gérée.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, type Writable } from "node:stream";
import { prismaMock } from "@/__mocks__/prisma";

const mockValidateMediaShareToken = vi.fn();
const mockGetS3ObjectStream = vi.fn();

vi.mock("@/modules/media", () => ({
  validateMediaShareToken: (...args: unknown[]) => mockValidateMediaShareToken(...args),
  getS3ObjectStream: (...args: unknown[]) => mockGetS3ObjectStream(...args),
  collectionPhotoWhere: () => ({ status: "APPROVED" }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Archive factice : écrit un contenu fixe dans le flux à la finalisation, ou échoue.
let finalizeFails = false;
const appended: string[] = [];
vi.mock("archiver", () => ({
  default: () => {
    let dest: Writable | null = null;
    return {
      pipe: (d: Writable) => {
        dest = d;
      },
      append: (_stream: unknown, { name }: { name: string }) => {
        appended.push(name);
      },
      finalize: async () => {
        if (finalizeFails) throw new Error("finalize failed");
        dest?.end("ZIP");
      },
    };
  },
}));

const { POST: downloadZip } = await import("../download/[token]/zip/route");
const { POST: collectionZip } = await import("../collection/[token]/zip/route");

const params = Promise.resolve({ token: "tok" });
const post = () => new Request("http://localhost", { method: "POST", body: "{}" });

async function readBody(res: Response): Promise<string> {
  return await new Response(res.body).text();
}

describe("routes ZIP des partages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finalizeFails = false;
    appended.length = 0;
    mockGetS3ObjectStream.mockResolvedValue(Readable.from(["data"]));
  });

  describe("download/[token]/zip", () => {
    beforeEach(() => {
      mockValidateMediaShareToken.mockResolvedValue({
        type: "MEDIA",
        mediaEvent: { id: "evt-1", name: "Culte du 5 octobre" },
      });
      prismaMock.mediaPhoto.findMany.mockResolvedValue([
        { filename: "a.jpg", originalKey: "k/a.jpg" },
        { filename: "b.jpg", originalKey: "k/b.jpg" },
      ] as never);
    });

    it("streame l'archive avec les photos et un nom de fichier assaini", async () => {
      const res = await downloadZip(post(), { params });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toBe(
        'attachment; filename="Culte_du_5_octobre.zip"'
      );
      expect(await readBody(res)).toBe("ZIP");
      expect(appended).toEqual(["a.jpg", "b.jpg"]);
    });

    it("ignore un objet absent du stockage sans interrompre l'archive", async () => {
      mockGetS3ObjectStream.mockRejectedValueOnce(new Error("NoSuchKey"));
      const res = await downloadZip(post(), { params });
      expect(await readBody(res)).toBe("ZIP");
      expect(appended).toEqual(["b.jpg"]);
    });

    it("fait échouer le flux si la finalisation échoue", async () => {
      finalizeFails = true;
      const res = await downloadZip(post(), { params });
      await expect(readBody(res)).rejects.toThrow("finalize failed");
    });
  });

  describe("collection/[token]/zip", () => {
    beforeEach(() => {
      mockValidateMediaShareToken.mockResolvedValue({
        type: "COLLECTION",
        label: "Rentrée 2026",
        config: { scope: "photos", eventIds: ["evt-1"], projectIds: [] },
      });
      prismaMock.mediaEvent.findMany.mockResolvedValue([
        { id: "evt-1", name: "Culte", photos: [{ filename: "a.jpg", originalKey: "k/a.jpg" }] },
      ] as never);
    });

    it("streame l'archive en rangeant les photos par événement", async () => {
      const res = await collectionZip(post(), { params });
      expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Rentr_e_2026.zip"');
      expect(await readBody(res)).toBe("ZIP");
      expect(appended).toEqual(["Culte/a.jpg"]);
    });

    it("fait échouer le flux si la finalisation échoue", async () => {
      finalizeFails = true;
      const res = await collectionZip(post(), { params });
      await expect(readBody(res)).rejects.toThrow("finalize failed");
    });
  });
});
