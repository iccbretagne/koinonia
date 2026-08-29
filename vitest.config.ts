import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/app/api/**", "src/modules/**"],
      // Seuils en CLIQUET ANTI-REGRESSION : cales juste sous la couverture reelle du moment
      // (40.14 / 36.07 / 41.49 / 41.66 au 2026-08-29), pas sur un objectif. A 20 %, soit la
      // moitie du reel, le seuil n'aurait pas detecte une chute de moitie de la couverture.
      // Les relever au fil des ajouts de tests ; elever l'objectif par module sensible reste
      // un chantier a part entiere (audit Q-01).
      thresholds: {
        statements: 38,
        branches: 34,
        functions: 39,
        lines: 39,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
