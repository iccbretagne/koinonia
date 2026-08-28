/**
 * Reprise d'écoute par appareil (spec 021) — `localStorage`, jamais le serveur : la spec
 * n'exige la reprise que sur le même appareil. Toujours proposée, jamais imposée.
 */
const STORAGE_KEY = "audio-progress:v1";
const MIN_POSITION_SECONDS = 30; // en dessous, pas la peine de proposer une reprise
const NEAR_END_SECONDS = 15; // à moins de 15s de la fin, la séquence est considérée terminée

export interface AudioProgressEntry {
  position: number;
  duration: number;
  updatedAt: number;
}

type ProgressStore = Record<string, AudioProgressEntry>;

function readStore(): ProgressStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ProgressStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage indisponible (navigation privée, quota) — la reprise ne sera pas mémorisée,
    // l'écoute continue normalement.
  }
}

/** Position sauvegardée pour une séquence, ou `null` si elle n'est pas assez avancée pour être proposée. */
export function getResumePosition(segmentId: string): number | null {
  const entry = readStore()[segmentId];
  if (!entry || entry.position < MIN_POSITION_SECONDS) return null;
  return entry.position;
}

/** Enregistre la position courante — à appeler à intervalle throttlé, pas à chaque `timeupdate`. */
export function saveProgress(segmentId: string, position: number, duration: number): void {
  const store = readStore();
  if (duration > 0 && position >= duration - NEAR_END_SECONDS) {
    // Séquence terminée : elle ne doit plus être proposée à la reprise.
    delete store[segmentId];
  } else {
    store[segmentId] = { position, duration, updatedAt: Date.now() };
  }
  writeStore(store);
}

/** Supprime explicitement une entrée — utilisé quand l'auditeur choisit « Depuis le début ». */
export function clearProgress(segmentId: string): void {
  const store = readStore();
  delete store[segmentId];
  writeStore(store);
}

/** Le plus récent culte pour lequel une reprise est disponible, parmi une liste d'IDs de séquences connus. */
export function findMostRecentResume(
  segmentIds: string[]
): { segmentId: string; position: number } | null {
  const store = readStore();
  let best: { segmentId: string; position: number; updatedAt: number } | null = null;
  for (const id of segmentIds) {
    const entry = store[id];
    if (!entry || entry.position < MIN_POSITION_SECONDS) continue;
    if (!best || entry.updatedAt > best.updatedAt) {
      best = { segmentId: id, position: entry.position, updatedAt: entry.updatedAt };
    }
  }
  return best ? { segmentId: best.segmentId, position: best.position } : null;
}
