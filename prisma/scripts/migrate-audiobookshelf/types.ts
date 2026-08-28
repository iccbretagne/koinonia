/**
 * Types partagés du script de migration Audiobookshelf → module audio Koinonia.
 *
 * Voir `specs/022-migration-audiobookshelf/` (spec, plan, reflexion) pour le contexte.
 * Ce fichier n'a aucun import runtime : il est sûr d'usage depuis les fonctions pures
 * comme depuis l'orchestration.
 */

/** Un fichier audio brut lu dans un dossier de culte Audiobookshelf. */
export interface ScanCulteFile {
  name: string;
  path: string;
  sizeBytes: number;
}

/** Un dossier de culte de la bibliothèque « cultes » (ex. `Culte 1 du 23 02 2025`). */
export interface ScanCulte {
  folder: string;
  files: ScanCulteFile[];
}

/** Un fichier de la bibliothèque « predications » (ex. `2025-02-09_12h00_La_loi.mp3`). */
export interface ScanPredication {
  date: string; // AAAA-MM-JJ
  time: string; // HH:MM
  rawTitle: string; // titre extrait du nom de fichier, `_` → espace
  path: string;
  sizeBytes: number;
  artist: string | null; // ID3 `artist`
  id3Title: string | null; // ID3 `title`
  series: string | null; // dossier de 1er niveau sous `predications/` (podcast) — null si « Prédications indépendantes »
}

/** Arborescence complète relevée sur disque, entrée de `buildManifest`. */
export interface Scan {
  cultes: ScanCulte[];
  predications: ScanPredication[];
}

/** Une séquence d'un culte dans le manifeste. */
export interface ManifestSequence {
  order: number;
  title: string;
  filePath: string;
  sizeBytes: number;
  isPredication: boolean;
  fromPredicationsLibrary: boolean;
}

/** Un culte prêt à être importé. */
export interface ManifestCulte {
  folder: string;
  date: string; // AAAA-MM-JJ
  slot: 1 | 2 | null;
  serviceDateUtc: string; // ISO, heure du culte convertie Europe/Paris → UTC
  title: string;
  speaker: string | null;
  series: string | null; // série / podcast d'origine de la prédication substituée — null sinon
  type: "CULTE" | "AUTRE";
  sequences: ManifestSequence[];
}

/** Diagnostics produits par `buildManifest` — affichés en `--dry-run`. */
export interface ManifestReport {
  unrecognizedFolders: string[];
  excludedFiles: { folder: string; name: string }[];
  nonCanonicalTitles: { folder: string; raw: string }[];
  collisions: { folder: string; title: string }[];
  cultesWithoutPredication: string[];
  substitutions: { folder: string; from: string }[];
  matchedPredicationUnused: { folder: string; predication: string }[];
}

export interface Manifest {
  cultes: ManifestCulte[];
  report: ManifestReport;
}
