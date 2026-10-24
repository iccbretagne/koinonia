/**
 * Clés de stockage du logo de la page de dons (spec 066). Chaque dépôt écrit une nouvelle clé,
 * jamais réécrite : son identifiant sert de version, et donc d'invalidation du cache.
 */
const KEY_PATTERN = /^giving\/[^/]+\/logo-([0-9a-f-]{36})\.png$/;

export function givingLogoKey(churchId: string, uuid: string): string {
  return `giving/${churchId}/logo-${uuid}.png`;
}

/** Version (uuid) d'une clé de logo, `null` sans logo ou pour une clé inattendue. */
export function logoVersionFromKey(key: string | null): string | null {
  return key ? (KEY_PATTERN.exec(key)?.[1] ?? null) : null;
}

/** Adresse publique du logo, servie par Koinonia (même origine pour l'export PNG). */
export function givingPublicLogoSrc(slug: string, key: string | null): string | null {
  const version = logoVersionFromKey(key);
  return version ? `/api/giving/public/${slug}/logo?v=${version}` : null;
}
