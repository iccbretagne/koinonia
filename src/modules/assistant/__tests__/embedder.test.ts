import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { CachedEmbedder, NullEmbedder, cosine, getEmbedder, isModelPresent } = await import("../services/embedder");

class CountingEmbedder {
  readonly model = "fake-model";
  calls: string[][] = [];
  async embed(texts: readonly string[]) {
    this.calls.push([...texts]);
    return texts.map((t) => Float32Array.from([t.length, 1]));
  }
}

describe("modèle de sens (spec 075)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'encode qu'une fois les textes de la base, relus depuis le cache", async () => {
    const inner = new CountingEmbedder();
    const cached = new CachedEmbedder(inner);
    const stored = new Uint8Array(Float32Array.from([9, 9]).buffer);
    prismaMock.assistantEmbedding.findMany.mockResolvedValue([
      { hash: "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce", model: "fake-model", vector: stored },
    ]);
    prismaMock.assistantEmbedding.createMany.mockResolvedValue({ count: 1 });
    const [a, b] = await cached.embed(["3", "deux"], "passage");
    expect(Array.from(a)).toEqual([9, 9]); // « 3 » relu en base
    expect(Array.from(b)).toEqual([4, 1]);
    expect(inner.calls).toEqual([["deux"]]);
    await cached.embed(["deux"], "passage");
    expect(inner.calls).toHaveLength(1);
  });

  it("ne met jamais en cache une question d'utilisateur", async () => {
    const inner = new CountingEmbedder();
    await new CachedEmbedder(inner).embed(["ma question"], "query");
    expect(prismaMock.assistantEmbedding.createMany).not.toHaveBeenCalled();
    expect(prismaMock.assistantEmbedding.findMany).not.toHaveBeenCalled();
  });

  it("repasse en lexical seul sans modèle sur le disque, sans appel réseau", async () => {
    process.env.ASSISTANT_MODEL_DIR = "/chemin/inexistant";
    expect(isModelPresent()).toBe(false);
    const embedder = getEmbedder();
    expect(embedder).toBeInstanceOf(NullEmbedder);
    await expect(embedder.embed(["x"], "query")).rejects.toThrow();
  });

  it("calcule la similarité cosinus de vecteurs normalisés", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBe(1);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBe(0);
  });
});
