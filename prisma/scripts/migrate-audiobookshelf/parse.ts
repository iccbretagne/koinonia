/**
 * Fonctions pures du script de migration Audiobookshelf.
 *
 * Aucun effet de bord, aucun accès disque/réseau — 100 % testables (`parse.test.ts`).
 * Voir `specs/022-migration-audiobookshelf/plan.md` § « Normalisation des titres » et
 * « Fonctions pures ».
 */

import type {
  Scan,
  Manifest,
  ManifestCulte,
  ManifestReport,
  ManifestSequence,
  ScanPredication,
} from "./types";

// ─── Normalisation de comparaison ────────────────────────────────────────────

/** minuscules, accents retirés, ponctuation → espace, espaces réduits. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─── Pistes ──────────────────────────────────────────────────────────────────

export interface ParsedTrack {
  order: number | null;
  rawTitle: string;
}

/**
 * `"#5 - Prédication.mp3"` → `{ order: 5, rawTitle: "Prédication" }`.
 * Le numéro est lu **avant** d'être retiré du libellé (il alimente l'ordre des séquences).
 * Un préfixe numérique n'est reconnu que précédé de `#`, ou à 1–2 chiffres sans `#`
 * (jamais une date `2025-02-16 …`).
 */
export function parseTrack(filename: string): ParsedTrack {
  let base = filename.replace(/\.[^.]+$/, "");
  let order: number | null = null;

  const hashed = /^#(\d+)\s*-\s*/.exec(base);
  const bare = /^(\d{1,2})\s*-\s*/.exec(base);
  if (hashed) {
    order = Number(hashed[1]);
    base = base.slice(hashed[0].length);
  } else if (bare) {
    order = Number(bare[1]);
    base = base.slice(bare[0].length);
  }

  const rawTitle = base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return { order, rawTitle };
}

// ─── Titres canoniques (template standard, décision spec §5) ─────────────────

export const CANONICAL_TITLES = [
  "Prière des STAR",
  "Louanges et adoration",
  "Sainte-cène",
  "Sainte-cène, dîmes et offrandes",
  "Dîmes et offrandes",
  "Prédication",
  "Annonces",
  "Prière de fin",
] as const;

export type CanonicalTitle = (typeof CANONICAL_TITLES)[number];

const CANONICAL_RULES: [RegExp, CanonicalTitle][] = [
  [/^priere des stars?$/, "Prière des STAR"],
  [/^louanges? et adorations?$/, "Louanges et adoration"],
  [/^louanges?$/, "Louanges et adoration"],
  [/^sainte cene et offrandes$/, "Sainte-cène, dîmes et offrandes"],
  [/^sainte cene$/, "Sainte-cène"],
  [/^(dimes et offrandes|dimes|offrandes)$/, "Dîmes et offrandes"],
  [/^predication( offrandes)?$/, "Prédication"],
  [/^predications$/, "Prédication"],
  [/^message$/, "Prédication"],
  [/^(moderation|annonces)$/, "Annonces"],
  [/^priere (finale|de fin)$/, "Prière de fin"],
];

/**
 * Rabat un titre brut sur le template standard. Renvoie le titre nettoyé tel quel
 * (casse et accents d'origine) si aucune règle ne correspond.
 */
export function canonicalTitle(rawTitle: string): string {
  const n = normalizeForMatch(rawTitle);
  for (const [re, canonical] of CANONICAL_RULES) {
    if (re.test(n)) return canonical;
  }
  return rawTitle.replace(/\s+/g, " ").trim();
}

/** Pistes à ne jamais importer : musique de fin (« MLA », « Balance MLA »…). */
export function isExcludedTrack(rawTitle: string, filename: string): boolean {
  if (!/\.mp3$/i.test(filename)) return true;
  const n = normalizeForMatch(rawTitle);
  return /\bmla\b/.test(n) || /\bbalance\b/.test(n);
}

/** Une séquence est « la prédication » ssi son titre canonique est exactement « Prédication ». */
export function isPredicationTrack(rawTitle: string): boolean {
  return canonicalTitle(rawTitle) === "Prédication";
}

// ─── Ordonnancement des pistes ──────────────────────────────────────────────

export interface OrderableTrack {
  order: number | null;
  title: string;
}

export interface OrderedResult<T extends OrderableTrack> {
  ordered: (T & { order: number })[];
  collisions: { title: string }[];
}

/**
 * Classe les pistes numérotées par ordre croissant, puis les pistes sans numéro dans
 * l'ordre de listing, et **renumérote 1..n de façon contiguë** (la numérotation
 * d'origine a des trous et des valeurs hautes réservées ; `AudioSegment` impose
 * `@@unique([serviceId, order])`).
 *
 * Déduplique les titres identiques après normalisation (suffixe ` (2)`, ` (3)`…) et
 * signale chaque collision.
 */
export function orderTracks<T extends OrderableTrack>(tracks: T[]): OrderedResult<T> {
  const numbered = tracks
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.order !== null)
    .sort((a, b) => a.t.order! - b.t.order! || a.i - b.i)
    .map((x) => x.t);
  const unnumbered = tracks.filter((t) => t.order === null);
  const sequence = [...numbered, ...unnumbered];

  const seen = new Map<string, number>();
  const collisions: { title: string }[] = [];
  const ordered = sequence.map((t, idx) => {
    const key = normalizeForMatch(t.title);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    let title = t.title;
    if (count > 1) {
      title = `${t.title} (${count})`;
      collisions.push({ title: t.title });
    }
    return { ...t, order: idx + 1, title };
  });

  return { ordered, collisions };
}

// ─── Dossiers de culte ──────────────────────────────────────────────────────

export interface ParsedCulteFolder {
  date: string; // AAAA-MM-JJ
  slot: 1 | 2 | null;
  label: string; // « Culte », « Culte 1 », « Cérémonie des baptêmes »
  type: "CULTE" | "AUTRE";
}

/**
 * `"Culte 2 du 11 05 2025"` → `{ date: "2025-05-11", slot: 2, label: "Culte 2", type: "CULTE" }`.
 * Gère `Culte du …`, `Culte 1|2 du …`, `Cérémonie des baptêmes du …` (→ `type: "AUTRE"`).
 * `null` si le nom n'est pas reconnu.
 */
export function parseCulteFolder(name: string): ParsedCulteFolder | null {
  const m = /^(.*?)(?:\s+([12]))?\s+du\s+(\d{2})\s+(\d{2})\s+(\d{4})$/.exec(name.trim());
  if (!m) return null;

  const [, prefixRaw, slotRaw, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const prefix = prefixRaw.trim();
  if (!prefix) return null;

  const slot = slotRaw ? (Number(slotRaw) as 1 | 2) : null;
  const label = slot ? `${prefix} ${slot}` : prefix;
  const type = /bapt[êe]me/i.test(prefix) ? "AUTRE" : "CULTE";

  return { date: `${yyyy}-${mm}-${dd}`, slot, label, type };
}

// ─── Fichiers de prédication ────────────────────────────────────────────────

export interface ParsedPredicationFile {
  date: string; // AAAA-MM-JJ
  time: string; // HH:MM
  rawTitle: string;
}

/** `"2025-02-09_12h00_La_loi_de_la_semence.mp3"` → date/heure/titre. `null` si non conforme. */
export function parsePredicationFile(name: string): ParsedPredicationFile | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})_(.+)\.mp3$/i.exec(name.trim());
  if (!m) return null;
  const [, yyyy, mm, dd, hh, min, rest] = m;
  if (Number(mm) > 12 || Number(dd) > 31 || Number(hh) > 23 || Number(min) > 59) return null;
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
    rawTitle: rest.replace(/_/g, " ").replace(/\s+/g, " ").trim(),
  };
}

// ─── Date / fuseau ─────────────────────────────────────────────────────────

/** Heure par défaut d'un culte sans prédication appariée : 12:00 pour le 2ᵉ culte, 10:00 sinon. */
export function defaultServiceTime(slot: 1 | 2 | null): string {
  return slot === 2 ? "12:00" : "10:00";
}

/** Décalage `Europe/Paris` (heure locale − UTC) en ms, à l'instant `at`. */
function parisOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second));
  return asUtc - at.getTime();
}

/**
 * Interprète `date` (AAAA-MM-JJ) + `time` (HH:MM) comme une heure murale `Europe/Paris`
 * et renvoie l'instant UTC correspondant. Correct en heure d'été comme en heure d'hiver
 * (les heures de culte, 10:00/12:00, ne tombent jamais dans le saut de changement d'heure).
 */
export function toUtcDate(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - parisOffsetMs(new Date(guess)));
}

// ─── Appariement prédication ────────────────────────────────────────────────

/**
 * Associe à un culte la prédication de la bibliothèque « predications » à la même date.
 * Journée à deux cultes + deux prédications → appariement par ordre horaire
 * (`slot 2` → la plus tardive, `slot 1`/`null` → la plus matinale). `null` si aucune.
 */
export function matchPredication(
  culte: { slot: 1 | 2 | null },
  predicationsForDate: ScanPredication[] | undefined
): ScanPredication | null {
  if (!predicationsForDate || predicationsForDate.length === 0) return null;
  if (predicationsForDate.length === 1) return predicationsForDate[0];
  const sorted = [...predicationsForDate].sort((a, b) => a.time.localeCompare(b.time));
  return culte.slot === 2 ? sorted[sorted.length - 1] : sorted[0];
}

// ─── Construction du manifeste ─────────────────────────────────────────────

function emptyReport(): ManifestReport {
  return {
    unrecognizedFolders: [],
    excludedFiles: [],
    nonCanonicalTitles: [],
    collisions: [],
    cultesWithoutPredication: [],
    substitutions: [],
    matchedPredicationUnused: [],
  };
}

/**
 * Transforme l'arborescence relevée en manifeste d'import + rapport de diagnostics.
 * Fonction pure : elle ne lit rien, tout vient de `scan`.
 */
export function buildManifest(scan: Scan): Manifest {
  const report = emptyReport();

  const predicationsByDate = new Map<string, ScanPredication[]>();
  for (const p of scan.predications) {
    const list = predicationsByDate.get(p.date) ?? [];
    list.push(p);
    predicationsByDate.set(p.date, list);
  }
  const usedPredicationPaths = new Set<string>();

  const cultes: ManifestCulte[] = [];

  for (const scanCulte of [...scan.cultes].sort((a, b) => a.folder.localeCompare(b.folder))) {
    const parsed = parseCulteFolder(scanCulte.folder);
    if (!parsed) {
      report.unrecognizedFolders.push(scanCulte.folder);
      continue;
    }

    // Pistes retenues (hors MLA / fichiers non-mp3), avec ordre et titre canonique.
    const tracks: { order: number | null; title: string; path: string; sizeBytes: number; raw: string }[] = [];
    for (const file of scanCulte.files) {
      const { order, rawTitle } = parseTrack(file.name);
      if (isExcludedTrack(rawTitle, file.name)) {
        if (/\.mp3$/i.test(file.name)) report.excludedFiles.push({ folder: scanCulte.folder, name: file.name });
        continue;
      }
      const title = parsed.type === "AUTRE" && scanCulte.files.filter((f) => /\.mp3$/i.test(f.name)).length === 1
        ? "Cérémonie"
        : canonicalTitle(rawTitle);
      if (parsed.type !== "AUTRE" && !CANONICAL_TITLES.includes(title as CanonicalTitle)) {
        report.nonCanonicalTitles.push({ folder: scanCulte.folder, raw: rawTitle });
      }
      tracks.push({ order, title, path: file.path, sizeBytes: file.sizeBytes, raw: rawTitle });
    }

    if (tracks.length === 0) {
      report.unrecognizedFolders.push(scanCulte.folder);
      continue;
    }

    const { ordered, collisions } = orderTracks(tracks);
    for (const c of collisions) report.collisions.push({ folder: scanCulte.folder, title: c.title });

    const predication = matchPredication(parsed, predicationsByDate.get(parsed.date));
    const predicationIndex = ordered.findIndex((t) => isPredicationTrack(t.raw));

    if (predicationIndex === -1) {
      report.cultesWithoutPredication.push(scanCulte.folder);
      if (predication) {
        report.matchedPredicationUnused.push({ folder: scanCulte.folder, predication: predication.path });
      }
    }

    const time = predication ? predication.time : defaultServiceTime(parsed.slot);
    const serviceDateUtc = toUtcDate(parsed.date, time).toISOString();

    const substituted = predicationIndex !== -1 && predication !== null;
    if (substituted) {
      report.substitutions.push({ folder: scanCulte.folder, from: predication!.rawTitle });
      usedPredicationPaths.add(predication!.path);
    }

    const title =
      substituted && predication
        ? (predication.id3Title?.replace(/\s+/g, " ").trim() || predication.rawTitle)
        : parsed.label;
    const speaker = substituted && predication ? predication.artist : null;

    const sequences: ManifestSequence[] = ordered.map((t, i) => {
      const isPred = i === predicationIndex;
      if (isPred && substituted && predication) {
        return {
          order: t.order,
          title: t.title,
          filePath: predication.path,
          sizeBytes: predication.sizeBytes,
          isPredication: true,
          fromPredicationsLibrary: true,
        };
      }
      return {
        order: t.order,
        title: t.title,
        filePath: t.path,
        sizeBytes: t.sizeBytes,
        isPredication: isPredicationTrack(t.raw),
        fromPredicationsLibrary: false,
      };
    });

    cultes.push({
      folder: scanCulte.folder,
      date: parsed.date,
      slot: parsed.slot,
      serviceDateUtc,
      title,
      speaker,
      type: parsed.type,
      sequences,
    });
  }

  return { cultes, report };
}
