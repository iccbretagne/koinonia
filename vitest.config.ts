import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/lib/**", "src/app/api/**", "src/modules/**"],
      exclude: ["**/*.test.ts", "**/__tests__/**", "**/__mocks__/**", "**/*.d.ts"],
      reporter: ["text-summary", "lcov"],
      // Non-régression : 1 à 2 points sous les mesures du 2026-10-04
      // (61.43 / 54.92 / 63.18 / 62.75), avec src/core et sans les helpers de tests.
      // Relever les seuils au fil des gains de couverture.
      thresholds: {
        statements: 60,
        branches: 53,
        functions: 62,
        lines: 61,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
