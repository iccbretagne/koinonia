/**
 * Génère `docs/openapi.json` depuis les contrats des routes API (ADR-0023).
 * Usage : `npm run openapi`. Le test `src/lib/openapi/__tests__/openapi.test.ts` échoue si le
 * fichier commité ne correspond plus aux contrats.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listRouteFiles, loadContracts } from "../src/lib/openapi/collect";
import { buildOpenApiDocument } from "../src/lib/openapi/document";

const OUT = join(process.cwd(), "docs/openapi.json");

async function main() {
  const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
  const routes = listRouteFiles();
  const missing = routes.filter((r) => !r.hasContract).map((r) => r.path);
  const doc = buildOpenApiDocument(await loadContracts(routes), version);
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(`docs/openapi.json : ${Object.keys(doc.paths ?? {}).length} adresses.`);
  if (missing.length) console.warn(`Sans contrat (${missing.length}) :\n  ${missing.join("\n  ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
