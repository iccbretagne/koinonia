/**
 * Journalisation du worker audio — préfixe commun, durées et tailles lisibles.
 *
 * Sortie sur stdout/stderr sans bibliothèque de log : le worker tourne sous systemd, journald
 * horodate, archive et filtre déjà chaque ligne (`journalctl -u koinonia-audio-worker`).
 *
 * Le worker était auparavant muet sur le chemin nominal — un job réussi ne produisait aucune
 * ligne. « Worker actif, aucun log » était donc indiscernable de « worker bloqué », ce qui a
 * masqué pendant plusieurs correctifs un job figé en `RUNNING` (voir l'amendement « le bail ne
 * tenait pas sa promesse de reprise » de l'ADR-0007). D'où le parti pris inverse : tracer les
 * transitions de job et les étapes longues (ffmpeg, S3), pas seulement les erreurs.
 */
const PREFIX = "[audio-worker]";

export function log(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logError(message: string, err?: unknown): void {
  if (err === undefined) console.error(`${PREFIX} ${message}`);
  else console.error(`${PREFIX} ${message}`, err);
}

/** Durée écoulée depuis `startedAt` (issu de `Date.now()`), lisible dans le journal. */
export function since(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

/** Taille lisible — les sources de culte pèsent typiquement des dizaines de Mo. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
