/** Erreur OAuth normalisée (RFC 6749 §5.2) : `error` est un code machine, jamais traduit. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400
  ) {
    super(description);
  }
}
