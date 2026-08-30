/**
 * Neutralise les valeurs pouvant être interprétées comme des formules par un tableur
 * (injection CSV/Excel). Préfixe d'une apostrophe les chaînes commençant par `=`, `+`,
 * `-`, `@`, une tabulation ou un retour chariot — le tableur les affiche alors comme du
 * texte au lieu de les évaluer.
 *
 * À utiliser sur toute donnée d'origine utilisateur écrite dans un export xlsx/csv,
 * a fortiori quand elle provient d'un formulaire public (visiteurs non authentifiés).
 */
export function sanitizeExcelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const sanitized = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeExcelValue(value);
  }
  return sanitized as T;
}
