import type { AudioPlayerSegment } from "@/components/audio/AudioPlayer";

/**
 * URL de streaming versionnée par le contenu du rendu (spec 026) — le paramètre `v` est un
 * casse-cache navigateur, jamais lu côté serveur. Module séparé du lecteur pour rester testable
 * sans importer la chaîne de dépendances du composant client (react-h5-audio-player).
 */
export function buildStreamUrl(token: string, segment: AudioPlayerSegment): string {
  return `/api/audio/public/${token}/stream/${segment.id}?v=${segment.version}`;
}
