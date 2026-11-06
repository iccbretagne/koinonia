/**
 * Évaluation du moteur de l'assistant avec le vrai modèle de sens (spec 075), hors CI.
 *
 *   node scripts/fetch-assistant-model.mjs && npm run assistant:eval
 *
 * Affiche, pour chaque question du jeu d'évaluation, la fiche en tête et son score, puis le
 * taux de bonnes réponses (cible ≥ 85 %). Sert à recalibrer `THRESHOLDS`, `SEMANTIC_FLOOR` et
 * `SEMANTIC_CEIL` (`src/modules/assistant/services/engine.ts`). N'écrit rien en base.
 */
import { BUILTIN_ENTRIES } from "../src/modules/assistant/knowledge";
import { EVAL_CASES } from "../src/modules/assistant/knowledge/eval";
import { PREDICATES } from "../src/modules/assistant/knowledge/types";
import { LocalEngine } from "../src/modules/assistant/services/engine";
import { OnnxEmbedder, isModelPresent, modelDir } from "../src/modules/assistant/services/embedder";
import { allManifests } from "../src/lib/manifests";

async function main() {
  if (!isModelPresent()) {
    console.error(`Modèle absent de ${modelDir()} : lancez d'abord node scripts/fetch-assistant-model.mjs`);
    process.exit(1);
  }
  const permissions = [...new Set(allManifests.flatMap((m) => Object.keys(m.permissions ?? {})))];
  const viewer = {
    userId: "eval",
    churchId: "eval",
    churchName: "Évaluation",
    churchCount: 1,
    isSuperAdmin: true,
    roles: ["SUPER_ADMIN"],
    permissions,
    predicates: [...PREDICATES],
    modules: allManifests.map((m) => m.name),
  };
  const engine = new LocalEngine(new OnnxEmbedder(modelDir()));
  let ok = 0;
  let semanticOk = 0;
  const semanticTotal = EVAL_CASES.filter((c) => c.semanticOnly).length;
  for (const c of EVAL_CASES) {
    const answer = await engine.answer({ question: c.question, viewer, entries: BUILTIN_ENTRIES });
    const got = "key" in answer ? answer.key : `${answer.kind}(${answer.suggestions.map((s) => s.key).join(",")})`;
    const hit = got === c.expected;
    if (hit) ok++;
    if (hit && c.semanticOnly) semanticOk++;
    console.log(`${hit ? "OK" : "KO"}  ${c.question}  →  ${got}  (attendu ${c.expected})`);
  }
  console.log(`\nEn tête : ${ok}/${EVAL_CASES.length} (${Math.round((ok / EVAL_CASES.length) * 100)} %)`);
  console.log(`Sans mot commun : ${semanticOk}/${semanticTotal}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
