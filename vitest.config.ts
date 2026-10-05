import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/lib/**", "src/modules/**", "src/app/**/*.ts", "src/proxy.ts"],
      exclude: ["**/*.test.ts", "**/__tests__/**", "**/__mocks__/**", "**/*.d.ts"],
      reporter: ["text-summary", "lcov"],
      // Non-régression : 1 à 2 points sous les mesures du 2026-10-05
      // (58.22 / 49.77 / 55.76 / 59.91). Périmètre : tout le TypeScript hors React — y compris
      // les helpers .ts des pages et src/proxy.ts, ajoutés ce jour (d'où la baisse apparente
      // par rapport aux 61/55/63/63 mesurés sur core/lib/modules/api seuls). Les composants
      // .tsx, sans tests, sont exclus ici comme dans sonar.coverage.exclusions.
      // Relever les seuils au fil des gains de couverture.
      thresholds: {
        statements: 57,
        branches: 48,
        functions: 54,
        lines: 58,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
