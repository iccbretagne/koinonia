import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  plugins: { "react-hooks": reactHooks },
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
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]
}];

export default eslintConfig;
