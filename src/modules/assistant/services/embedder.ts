import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Modèle de sens de l'assistant (spec 075) : petit modèle d'embeddings multilingue exécuté dans
 * le processus Node, **sans aucun appel réseau** (le modèle est embarqué dans l'artefact par la
 * CI). Modèle absent, illisible ou en erreur → `NullEmbedder`, et le moteur passe au lexical seul.
 */

export const MODEL_NAME = "Xenova/multilingual-e5-small";

export type EmbedKind = "query" | "passage";

export interface Embedder {
  /** Nom du modèle (clé du cache), `null` si aucun modèle. */
  readonly model: string | null;
  /** Vecteurs normalisés, dans l'ordre des textes. */
  embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]>;
}

/** Aucun modèle : le moteur se contente du score lexical. */
export class NullEmbedder implements Embedder {
  readonly model = null;
  async embed(): Promise<Float32Array[]> {
    throw new Error("Aucun modèle de sens");
  }
}

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

/** transformers.js sur onnxruntime-node, chargé une seule fois, à la première question. */
export class OnnxEmbedder implements Embedder {
  readonly model = MODEL_NAME;
  private extractor: Promise<Extractor> | null = null;

  constructor(private readonly modelDir: string) {}

  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      const transformers = await import("@huggingface/transformers");
      transformers.env.allowRemoteModels = false;
      transformers.env.allowLocalModels = true;
      transformers.env.localModelPath = this.modelDir;
      const pipe = await transformers.pipeline("feature-extraction", MODEL_NAME, { dtype: "q8" });
      return pipe as unknown as Extractor;
    })();
    return this.extractor;
  }

  async embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    // Convention e5 : préfixes « query: » et « passage: ».
    const output = await extractor(
      texts.map((t) => `${kind}: ${t}`),
      { pooling: "mean", normalize: true }
    );
    return output.tolist().map((v) => Float32Array.from(v));
  }
}

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Cache des vecteurs de la base (`assistant_embeddings`) : les fiches ne sont encodées qu'une
 * fois, même après un redémarrage. Les questions des utilisateurs ne sont jamais mises en cache.
 */
export class CachedEmbedder implements Embedder {
  private readonly memory = new Map<string, Float32Array>();

  constructor(private readonly inner: Embedder) {}

  get model() {
    return this.inner.model;
  }

  async embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]> {
    if (kind === "query" || !this.inner.model) return this.inner.embed(texts, kind);
    const model = this.inner.model;
    const hashes = texts.map(hashOf);
    const missing = [...new Set(hashes.filter((h) => !this.memory.has(h)))];
    if (missing.length > 0) {
      const rows = await prisma.assistantEmbedding
        .findMany({ where: { model, hash: { in: missing } } })
        .catch(() => []);
      for (const row of rows) {
        const bytes = Uint8Array.from(row.vector);
        this.memory.set(row.hash, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
      }
    }
    const toCompute = texts.filter((_, i) => !this.memory.has(hashes[i]));
    const unique = [...new Map(toCompute.map((t) => [hashOf(t), t])).values()];
    if (unique.length > 0) {
      const vectors = await this.inner.embed(unique, kind);
      const data = unique.map((text, i) => {
        const hash = hashOf(text);
        this.memory.set(hash, vectors[i]);
        return { hash, model, vector: new Uint8Array(Float32Array.from(vectors[i]).buffer) };
      });
      await prisma.assistantEmbedding.createMany({ data, skipDuplicates: true }).catch(() => undefined);
    }
    return hashes.map((h) => this.memory.get(h)!);
  }
}

let shared: Embedder | null = null;
let fallbackLogged = false;

function logFallbackOnce(reason: string) {
  if (fallbackLogged) return;
  fallbackLogged = true;
  logger.warn(`Assistant : recherche par le sens indisponible (${reason}), recherche par mots seule.`);
}

/** Dossier du modèle : `ASSISTANT_MODEL_DIR`, par défaut `./models`. */
export function modelDir(): string {
  return path.resolve(process.env.ASSISTANT_MODEL_DIR ?? "models");
}

/** Le modèle embarqué est présent sur le disque. */
export function isModelPresent(dir = modelDir()): boolean {
  return existsSync(path.join(dir, MODEL_NAME, "onnx", "model_quantized.onnx"));
}

/** Encodeur partagé du processus ; repli silencieux (journalisé une fois) sans modèle. */
export function getEmbedder(): Embedder {
  if (shared) return shared;
  const dir = modelDir();
  if (!isModelPresent(dir)) {
    logFallbackOnce(`modèle absent de ${dir}`);
    shared = new NullEmbedder();
  } else {
    shared = new CachedEmbedder(new OnnxEmbedder(dir));
  }
  return shared;
}

/** Un échec du modèle bascule le processus en lexical seul. */
export function disableEmbedder(error: unknown) {
  logFallbackOnce(error instanceof Error ? error.message : String(error));
  shared = new NullEmbedder();
}

/** Similarité cosinus de deux vecteurs normalisés. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
