import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
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
