import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

// Garde du design system (spec 055, ADR-0018) : aucune couleur de palette brute ni hex dans les
// classes. Voir docs/design-system/migration.md pour les équivalents en tokens.
const RAW_COLOR =
  "(^|[\\s:'\"`])(!?)(bg|text|border|divide|ring|ring-offset|from|to|via|fill|stroke|outline|placeholder|accent|decoration|caret|shadow)-(gray|slate|zinc|neutral|stone|red|rose|pink|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia)-[0-9]{2,3}\\b|(^|[\\s:'\"`])(bg|text|border|ring|divide)-(white|black)\\b|(bg|text|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\]";
const designSystemGuard = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/**/__tests__/**", "src/generated/**", "src/lib/email*.ts", "src/lib/report-export.ts"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: `Literal[value=/${RAW_COLOR}/]`, message: "Couleur en dur : utiliser les tokens du design system (docs/design-system/migration.md)." },
      { selector: `TemplateElement[value.raw=/${RAW_COLOR}/]`, message: "Couleur en dur : utiliser les tokens du design system (docs/design-system/migration.md)." },
    ],
  },
};

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, designSystemGuard, {
  plugins: { "react-hooks": reactHooks, react },
  settings: { react: { version: "19.2.8" } },
  rules: {
    // Warn on any usage instead of error to allow gradual adoption
    "@typescript-eslint/no-explicit-any": "warn",
    // Empty catch blocks should at minimum have a comment
    "no-empty": ["error", { allowEmptyCatch: false }],
    // setState in effects is a valid pattern for syncing with external state (e.g. route changes)
    "react-hooks/set-state-in-effect": "warn",
    // Convention underscore : paramètres préfixés _ sont intentionnellement inutilisés
    "@typescript-eslint/no-unused-vars": ["warn", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
    }],
    // Props React non-readonly (Sonar S6759, issue #539 phase 4) : cliquet, corrigé
    // partout au moment de l'activation — ne doit plus régresser.
    "react/prefer-read-only-props": "warn",
  },
}, {
  // "dist/**" : bundle esbuild du worker audio (généré par `npm run build:worker`)
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "coverage/**"]
}];

export default eslintConfig;
