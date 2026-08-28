# Plan technique — Filtres et tris multicritères de la file Production audio

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-28

> Ce plan traduit la spec en approche technique conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module. La page
      serveur charge déjà les données ; tout se fait côté client sur ces props.
- [x] **Sécurité** : `src/app/(auth)/audio/production/page.tsx` garde son
      `requireAudioAccess("audio:view", churchId)` ; le `findMany` reste filtré
      par `churchId`. La feature ne touche ni la requête, ni le garde d'accès.
- [x] **Permissions** via `rolePermissions` : inchangé (aucun contrôle ajouté).
- [x] **Validation Zod** : aucune mutation, aucune entrée serveur nouvelle → N/A.
- [x] **Migration Prisma** : **aucun changement de schéma**.
- [x] **Enums** depuis `@/generated/prisma/client` : pas de nouvel enum importé ;
      on réutilise les libellés de statut déjà définis localement dans
      `AudioQueueClient.tsx` et `EVENT_TYPE_OPTIONS` de `@/lib/event-types`.
- [x] **UI** : réutilisation de `Input`, `Select`, `Button`, `DataTable` de
      `src/components/ui/` ; `DataTable` reçoit une extension **rétro-compatible**
      pour le tri par en-tête (cf. Décisions).

## Approche générale

Tout se passe dans le composant client existant
`src/app/(auth)/audio/production/AudioQueueClient.tsx`, qui reçoit déjà la liste
complète des `AudioService` de l'église en props. On y ajoute :

1. un **état de critères** (statut, type, période, recherche texte, orateur) et
   un **état de tri** (clé + sens) ;
2. une dérivation `useMemo` : `sortQueue(filterQueue(services, criteres), tri)` ;
3. des **contrôles de filtre** au-dessus du tableau (composants `ui/`), un
   **compteur de résultats**, un bouton **Réinitialiser** ;
4. des **en-têtes cliquables** sur `DataTable` pour les colonnes triables.

La logique pure (filtrage, tri, dérivation de la liste d'orateurs,
normalisation du texte) est extraite dans un module **sans React**
`queue-filters.ts`, couvert par Vitest. Le composant ne fait que câbler
état ↔ helpers ↔ rendu.

**Persistance pendant la navigation** : les critères et le tri sont miroir dans
une variable de portée module (`let lastState` dans `queue-filters.ts`), lue à
l'montage et réécrite à chaque changement. Elle survit à une navigation SPA
(ouvrir un enregistrement puis revenir, création depuis la modale) et est
perdue au rechargement complet de l'onglet — exactement le comportement spécifié.
Aucun `sessionStorage`, aucun paramètre d'URL.

## Modèle de données

`[Aucun changement]` — ni schéma, ni migration. Les champs utilisés
(`serviceDate`, `title`, `speaker`, `type`, `status`, `openCount`,
`_count.segments`, `planningEvent.title`) sont déjà chargés et passés au client.

## API

`[Aucun endpoint ajouté ou modifié]`. Le filtrage/tri est 100 % client sur les
données déjà transmises. La page serveur reste inchangée (au plus : rien).

## Services / logique métier

Aucun service de module (`src/modules/audio/`) touché — la file Production
n'appelle pas le module pour lister, elle lit `prisma.audioService` directement
dans la page (comportement préexistant, hors périmètre de cette feature).

### Nouveau module pur — `src/app/(auth)/audio/production/queue-filters.ts`

Sans import React. Types et fonctions :

```ts
export type SortKey = "date" | "status" | "segments" | "opens";
export type SortDir = "asc" | "desc";

export interface QueueCriteria {
  status: string;          // "" = tous ; sinon une valeur de statut
  type: string;            // "" = tous ; sinon EVENT_TYPES
  year: string;            // "" ou "AAAA" (raccourci de période)
  from: string;            // "" ou "AAAA-MM-JJ"
  to: string;              // "" ou "AAAA-MM-JJ"
  text: string;            // recherche libre (titre + orateur)
  speaker: string;         // "" = tous ; "__NONE__" = sans orateur ; sinon nom exact
}

export const EMPTY_CRITERIA: QueueCriteria;
export const NO_SPEAKER = "__NONE__";
export const DEFAULT_SORT: { key: SortKey; dir: SortDir }; // { key: "date", dir: "desc" }

// Ordre de workflow du tri par statut (décision spec)
export const STATUS_SORT_ORDER: Record<string, number>;
//  PENDING_REVIEW(0) → READY(1) → DRAFT(2) → PUBLISHED(3) → UNPUBLISHED(4)

export function deriveSpeakers(rows: Row[]): string[];
//  orateurs non vides, dédoublonnés (casse/accent ignorés pour l'unicité,
//  1re graphie rencontrée conservée), triés localeCompare("fr").

export function isRangeValid(c: QueueCriteria): boolean;
//  false si from & to renseignés et from > to → l'appelant affiche le message.

export function filterQueue(rows: Row[], c: QueueCriteria): Row[];
//  intersection de tous les critères actifs. Range invalide → [].

export function sortQueue(rows: Row[], key: SortKey, dir: SortDir): Row[];
//  copie triée ; départage systématique par serviceDate décroissante
//  (ordre stable et prévisible, cf. spec).

// Persistance intra-session (portée module)
export function loadState(): { criteria: QueueCriteria; sort: {...} } | null;
export function saveState(s: { criteria: QueueCriteria; sort: {...} }): void;
```

`Row` = le type de ligne déjà défini dans `AudioQueueClient.tsx`
(`AudioServiceRow`) ; on le déplace dans `queue-filters.ts` et on l'importe
depuis le composant pour éviter la duplication.

### Normalisation de la recherche — `src/lib/text.ts` (nouveau, minimal)

```ts
/** minuscule, accents retirés (NFD), espaces réduits. */
export function normalizeText(s: string | null | undefined): string;
```

L'idiome `.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()` est
aujourd'hui recopié à la main dans ~10 fichiers (`ReportsClient`,
`DiscipleshipClient`, `ChurchesClient`…). On crée le helper partagé et on
l'utilise **ici uniquement** ; la reprise des autres appels est hors périmètre
(note pour un `chore:` ultérieur).

## UI / composants

### `AudioQueueClient.tsx` (modifié)

- **État** : `const [criteria, setCriteria] = useState<QueueCriteria>(() => loadState()?.criteria ?? EMPTY_CRITERIA)` ; idem pour `sort`. `useEffect` → `saveState({ criteria, sort })` à chaque changement.
- **Barre de filtres** (au-dessus du tableau), grille responsive calquée sur
  `LibraryFiltersClient` de l'onglet (re)Écouter (`grid gap-3 grid-cols-1
  sm:grid-cols-2 lg:grid-cols-5`, bouton « Filtrer (n) » qui déplie sur mobile) :
  | Contrôle | Composant | Source des options |
  |---|---|---|
  | Statut | `Select` | `STATUS_LABELS` (existant, choix unique inchangé) |
  | Type de rassemblement | `Select` | `EVENT_TYPE_OPTIONS` |
  | Année | `Select` | années distinctes présentes dans `services` (desc) |
  | Du / Au | deux `Input type="date"` | — |
  | Orateur | `Select` | `deriveSpeakers(services)` + option « Sans orateur » |
  | Recherche | `Input` | libre, **débounce 300 ms** (même constante que (re)Écouter) |
- **Ligne d'état** : `« N enregistrement(s) »` + `Button variant="secondary"
  size="sm"` **Réinitialiser** (visible seulement si un critère ou un tri
  non-défaut est actif) → `setCriteria(EMPTY_CRITERIA); setSort(DEFAULT_SORT)`.
- **Message vide** : si `!isRangeValid(criteria)` → « La date de fin est
  antérieure à la date de début. » ; sinon si résultat vide → passe
  `emptyMessage="Aucun enregistrement ne correspond aux filtres."` à `DataTable`.
- **Tableau** : `DataTable` reçoit `data={visible}` (déjà filtré+trié) et, pour
  les colonnes Date / Statut / Séquences / Ouvertures, un `sortKey` +
  `sort={sort}` + `onSortChange={setSort}` (cf. extension ci-dessous). Le clic
  sur un en-tête déjà actif inverse `dir` ; sur un autre en-tête bascule la clé
  avec un sens par défaut (`desc` pour date/opens/segments, `asc` pour status).
- La modale « Déposer un enregistrement » et le reste sont **inchangés**.

### `src/components/ui/DataTable.tsx` (extension rétro-compatible)

Nouvelles props **optionnelles** — sans elles, comportement identique à
aujourd'hui :

```ts
interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  sortKey?: string;               // rend l'en-tête cliquable
}
interface DataTableProps<T> {
  // …existant…
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (s: { key: string; dir: "asc" | "desc" }) => void;
}
```

- En-tête avec `sortKey` : rendu en `<button>` avec indicateur ▲ / ▼ selon
  `sort`. Clic → `onSortChange`. Accessible (`aria-sort` sur le `<th>`).
- Le **tri n'est pas exécuté par `DataTable`** : il ne fait que remonter l'état,
  le parent trie ses données. `DataTable` reste un composant d'affichage.
- Vue mobile (cartes) : pas d'en-tête de colonne → on ajoute un petit
  `Select` « Trier par » au-dessus des cartes, alimenté par les mêmes colonnes
  `sortKey` (libellé = `header`), pour garder la parité mobile (mémoire projet :
  cohérence mobile systématique).
- Vérifier que les autres appelants (`admin/*`, etc.) compilent inchangés.

## Décisions & alternatives écartées

- **Choix : filtrage/tri côté client dans le composant existant.**
  *Pourquoi* : volume borné (quelques centaines de lignes, +1–2/semaine), pas de
  besoin de partage d'URL sur une file de travail, données déjà toutes chargées.
  Zéro endpoint, zéro requête supplémentaire.
- **Choix : logique pure isolée dans `queue-filters.ts`.** *Pourquoi* :
  testable au Vitest sans rendre de React (norme du repo — on teste les helpers,
  ex. `report-export.ts`, pas les `*Client.tsx`).
- **Choix : persistance par variable de portée module.** *Pourquoi* : c'est le
  seul mécanisme qui survit à la navigation SPA **et** se réinitialise au
  rechargement complet, comme demandé. `sessionStorage` survivrait au reload ;
  l'URL rendrait l'état partageable (non voulu ici).
- **Choix : tri par clic d'en-tête via extension de `DataTable`.**
  *Pourquoi* : la spec (et la question tranchée avec l'utilisateur) décrit un
  tri « clic sur l'en-tête de colonne ». L'extension est rétro-compatible
  (props optionnelles) et devient réutilisable — première table triable du repo.
  *Point à arbitrer* : l'onglet voisin (re)Écouter utilise un simple `Select`
  « Trier par ». Si l'on préfère la cohérence stricte avec lui et un footprint
  nul sur `DataTable`, basculer sur un `Select` « Trier par » dans
  `AudioQueueClient` (les helpers `sortQueue` sont identiques). À confirmer à
  l'étape `/tasks`.
- **Écarté : réutiliser `listPublishedServices` / `listSpeakers` du module
  audio (comme (re)Écouter).** *Raison* : ces helpers ne renvoient que les
  cultes **publiés** ; la file Production doit montrer tous les statuts
  (Brouillon, À nommer, Rendu en cours, Dépublié). La page garde donc son
  `prisma.audioService.findMany` actuel.
- **Écarté : pagination / chargement incrémental.** *Raison* : hors périmètre
  spec, volume ne le justifie pas.

## Risques & points d'attention

- **Extension d'un composant `ui/` partagé** : `DataTable` est utilisé par
  plusieurs écrans admin. Mitigation : toutes les nouvelles props optionnelles,
  aucun changement de comportement sans `sortKey`/`onSortChange` ;
  `npm run typecheck` + revue rapide des autres appelants.
- **Cohérence mobile** : `DataTable` a une vue cartes distincte sans en-têtes →
  prévoir le `Select` « Trier par » mobile dès l'implémentation, pas après.
- **Valeurs de `type`** : la file peut contenir des `type` hors
  `EVENT_TYPES` (données anciennes) ; `getEventTypeLabel` retombe déjà sur la
  valeur brute. Le `Select` type liste `EVENT_TYPE_OPTIONS` — un enregistrement
  au type exotique ne sera pas filtrable par ce `Select` mais reste visible sans
  filtre. Acceptable (aucun cas connu après migration : `CULTE` / `AUTRE`).
- **Liste d'années vide** si l'église n'a aucun enregistrement → masquer le
  `Select` Année (ou option unique désactivée). Détail d'implémentation.
- **Débounce recherche** : réutiliser la constante 300 ms et le pattern
  `useRef<setTimeout>` de `LibraryFiltersClient` pour rester homogène.
- **`normalizeText` sur `null`** : signature `string | null | undefined` →
  `""`. Les lignes sans titre ni orateur ne matchent jamais une recherche non
  vide, matchent toujours une recherche vide (critère spec).

## Stratégie de tests

**Vitest** — nouveau `src/app/(auth)/audio/production/queue-filters.test.ts` et
`src/lib/__tests__/text.test.ts`.

- `normalizeText` : accents, casse, `null`/`undefined`, espaces multiples.
- `deriveSpeakers` : dédoublonnage insensible casse/accent, tri fr, exclusion
  des vides/espaces, aucune valeur d'une autre église (les `rows` sont déjà
  scoping église — on teste juste la pureté sur un échantillon).
- `filterQueue` :
  - chaque critère isolé (statut, type, année, plage du/au, texte, orateur) ;
  - **combinaison** de 3+ critères → intersection ;
  - `text` insensible casse/accents, sur titre **et** orateur, robatuste au
    `null` ;
  - orateur = `NO_SPEAKER` → uniquement les lignes sans orateur ;
  - `from > to` → `[]` et `isRangeValid` → `false` ;
  - année + plage combinées.
- `sortQueue` : les 4 clés × 2 sens ; départage par date décroissante à valeur
  égale ; `STATUS_SORT_ORDER` respecté (PENDING_REVIEW en tête, UNPUBLISHED en
  fin).
- `loadState` / `saveState` : aller-retour, `loadState` initial → `null`.

Pas de test de rendu React (conforme à la pratique du repo). Vérif manuelle
recette : dépliage mobile, `aria-sort`, bouton Réinitialiser, compteur.

## Vérification finale (avant PR)

`npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`
puis relecture des critères d'acceptation de `spec.md` un par un.
