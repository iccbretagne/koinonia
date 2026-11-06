#!/usr/bin/env node
/**
 * Télécharge le modèle de sens de l'assistant (spec 075) dans `models/`, au build, pour
 * l'embarquer dans l'artefact : en production, aucun appel réseau (ADR-0028).
 *
 * Usage : node scripts/fetch-assistant-model.mjs [dossier]   (défaut : ./models)
 * `ASSISTANT_MODEL_REVISION` fige la révision Hugging Face (défaut : main).
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MODEL = "Xenova/multilingual-e5-small";
const REVISION = process.env.ASSISTANT_MODEL_REVISION ?? "main";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx"];

const target = path.resolve(process.argv[2] ?? "models", MODEL);

for (const file of FILES) {
  const destination = path.join(target, file);
  if (existsSync(destination) && statSync(destination).size > 0) continue;
  mkdirSync(path.dirname(destination), { recursive: true });
  const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url} : ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  console.log(`${file} : ${(statSync(destination).size / 1e6).toFixed(1)} Mo`);
}
console.log(`Modèle de l'assistant prêt dans ${target}`);
