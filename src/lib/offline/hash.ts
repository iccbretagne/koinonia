/**
 * Empreinte SHA-256 hexadécimale d'un texte, calculée sur l'appareil (`crypto.subtle`) : un QR
 * scanné hors ligne est comparé aux empreintes de l'instantané, sans aucun jeton stocké
 * (spec 074, ADR-0026). Disponible dans les navigateurs (contexte sécurisé) et dans Node ≥ 20.
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifiant d'opération ou d'appareil, unique et sans coordination. */
export function newOpId(): string {
  return globalThis.crypto.randomUUID();
}
