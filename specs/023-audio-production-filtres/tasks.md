# Tâches — Filtres et tris multicritères de la file Production audio

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée (code + tests OK) ; vérif manuelle recette à faire

> Tâches ordonnées et vérifiables. Cette feature **ne modifie ni le schéma, ni
> les routes API** : l'ordre naturel devient
> *helpers purs → composant UI partagé → composant de la file → tests*.
> Les tâches `[P]` sont parallélisables (fichiers indépendants).

## Prérequis

- [x] Branche créée : `feat/audio-production-filtres` (depuis `main`)
- [x] **Aucune migration Prisma** — schéma inchangé (vérifier qu'aucune tâche
      n'en introduit)
- [x] **Aucun endpoint** ajouté ou modifié (vérifier)

## Tâches

### 1. Données & migration

*Aucune tâche — pas de changement de schéma, pas de nouvelle donnée serveur.
La page `src/app/(auth)/audio/production/page.tsx` charge déjà tous les champs
nécessaires (`serviceDate`, `title`, `speaker`, `type`, `status`, `openCount`,
`_count.segments`, `planningEvent.title`).*

### 2. Logique métier — helpers purs (sans React)

- [x] **T1** [P] — `normalizeText(s: string | null | undefined): string` :
      minuscule, accents retirés (NFD + `/[̀-ͯ]/g`), espaces réduits.
      *(fichier : `src/lib/text.ts`)*
- [x] **T2** — Déplacer le type de ligne `AudioServiceRow` de
      `AudioQueueClient.tsx` vers `queue-filters.ts` et le ré-exporter ; le
      composant l'importe désormais de là (pas de duplication).
      *(fichiers : `src/app/(auth)/audio/production/queue-filters.ts`,
      `src/app/(auth)/audio/production/AudioQueueClient.tsx`)*
- [x] **T3** — Constantes et types dans `queue-filters.ts` : `SortKey`
      (`"date" | "status" | "segments" | "opens"`), `SortDir`, `QueueCriteria`,
      `EMPTY_CRITERIA`, `NO_SPEAKER = "__NONE__"`,
      `DEFAULT_SORT = { key: "date", dir: "desc" }`, `STATUS_SORT_ORDER`
      (`PENDING_REVIEW` 0 → `READY` 1 → `DRAFT` 2 → `PUBLISHED` 3 →
      `UNPUBLISHED` 4). *(fichier : `queue-filters.ts`)*
- [x] **T4** — `deriveSpeakers(rows): string[]` : orateurs non vides, trim,
      dédoublonnage insensible casse/accents (1re graphie conservée), tri
      `localeCompare("fr")`. *(fichier : `queue-filters.ts`)*
- [x] **T5** — `isRangeValid(c: QueueCriteria): boolean` : `false` si `from` et
      `to` renseignés et `from > to`, `true` sinon. *(fichier : `queue-filters.ts`)*
- [x] **T6** — `filterQueue(rows, c): Row[]` : intersection de tous les critères
      actifs — `status` (exact), `type` (exact), `year` (année de `serviceDate`),
      `from`/`to` (bornes incluses sur `serviceDate`), `text`
      (`normalizeText` sur `title` **et** `speaker`, robuste au `null`),
      `speaker` (`NO_SPEAKER` → lignes sans orateur ; sinon égalité exacte).
      Si `!isRangeValid(c)` → `[]`. *(fichier : `queue-filters.ts`)*
- [x] **T7** — `sortQueue(rows, key, dir): Row[]` : copie triée ; `status` via
      `STATUS_SORT_ORDER` ; départage systématique par `serviceDate`
      décroissante à valeur égale. *(fichier : `queue-filters.ts`)*
- [x] **T8** — Persistance intra-session : `loadState()` /
      `saveState(state)` sur une variable de portée module (pas de
      `sessionStorage`, pas d'URL). `loadState()` initial → `null`.
      *(fichier : `queue-filters.ts`)*

### 3. API

*Aucune tâche.*

### 4. UI

- [x] **T9** — Extension **rétro-compatible** de `DataTable` pour le tri par
      en-tête : prop de colonne optionnelle `sortKey?: string` (rend l'en-tête
      en `<button>` avec indicateur ▲/▼ et `aria-sort` sur le `<th>`), props de
      table optionnelles `sort?: { key; dir }` et `onSortChange?`. `DataTable`
      **ne trie pas** : il remonte l'état, le parent trie. Sans ces props →
      comportement strictement identique à aujourd'hui.
      *(fichier : `src/components/ui/DataTable.tsx`)*
- [x] **T10** — Parité mobile de `DataTable` : quand des colonnes ont un
      `sortKey` et que `onSortChange` est fourni, afficher au-dessus de la vue
      cartes un `Select` « Trier par » (options = `header` des colonnes
      triables) piloté par le même `sort` / `onSortChange`.
      *(fichier : `src/components/ui/DataTable.tsx`)*
- [x] **T11** — Vérifier que les autres appelants de `DataTable`
      (`src/app/(auth)/admin/**`, etc.) compilent et s'affichent inchangés
      (aucune prop nouvelle passée). *(vérif : `npm run typecheck` + revue)*
- [x] **T12** — `AudioQueueClient.tsx` — état : `criteria`
      (`useState<QueueCriteria>(() => loadState()?.criteria ?? EMPTY_CRITERIA)`)
      et `sort` (idem `?? DEFAULT_SORT`) ; `useEffect` → `saveState({ criteria,
      sort })` à chaque changement. Retirer l'ancien `statusFilter` (absorbé par
      `criteria.status`). *(fichier : `AudioQueueClient.tsx`)*
- [x] **T13** — `AudioQueueClient.tsx` — barre de filtres responsive au-dessus
      du tableau (grille calquée sur `LibraryFiltersClient` de (re)Écouter :
      `grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`, bouton
      « Filtrer (n) » qui déplie sur mobile) :
      Statut (`Select`, `STATUS_LABELS`, choix unique), Type (`Select`,
      `EVENT_TYPE_OPTIONS`), Année (`Select`, années distinctes de `services`
      desc ; masqué si aucune), Du / Au (deux `Input type="date"`), Orateur
      (`Select`, `deriveSpeakers(services)` + option « Sans orateur »),
      Recherche (`Input`, **débounce 300 ms** — même constante et pattern
      `useRef<setTimeout>` que `LibraryFiltersClient`).
      *(fichier : `AudioQueueClient.tsx`)*
- [x] **T14** — `AudioQueueClient.tsx` — dérivation
      `const visible = useMemo(() => sortQueue(filterQueue(services, criteria),
      sort.key, sort.dir), [services, criteria, sort])` ; passer `visible` à
      `DataTable` avec `sortKey` sur les colonnes Date / Statut / Séquences /
      Ouvertures, `sort={sort}` et `onSortChange={setSort}` (clic sur en-tête
      actif → inverse `dir` ; autre en-tête → nouvelle clé, sens par défaut
      `desc` sauf `status` → `asc`). *(fichier : `AudioQueueClient.tsx`)*
- [x] **T15** — `AudioQueueClient.tsx` — ligne d'état : compteur
      « N enregistrement(s) » + `Button variant="secondary" size="sm"`
      **Réinitialiser** (visible si un critère est actif ou le tri ≠ défaut) →
      `setCriteria(EMPTY_CRITERIA); setSort(DEFAULT_SORT)`.
      *(fichier : `AudioQueueClient.tsx`)*
- [x] **T16** — `AudioQueueClient.tsx` — messages vides : si
      `!isRangeValid(criteria)` → « La date de fin est antérieure à la date de
      début. » ; sinon si `visible.length === 0` →
      `emptyMessage="Aucun enregistrement ne correspond aux filtres."`.
      *(fichier : `AudioQueueClient.tsx`)*

### 5. Tests (Vitest)

- [x] **T17** [P] — `src/lib/__tests__/text.test.ts` : `normalizeText` —
      accents, casse, `null`/`undefined` → `""`, espaces multiples réduits.
- [x] **T18** [P] — `queue-filters.test.ts` — `deriveSpeakers` : dédoublonnage
      insensible casse/accents, tri fr, exclusion des vides/espaces.
- [x] **T19** — `queue-filters.test.ts` — `isRangeValid` + `filterQueue` :
      chaque critère isolé (statut, type, année, plage du/au bornes incluses,
      texte sur titre **et** orateur insensible casse/accents et robuste au
      `null`, orateur exact, `NO_SPEAKER` → sans orateur) ; **combinaison de
      3+ critères** = intersection ; `from > to` → `[]` ; année + plage
      combinées.
- [x] **T20** — `queue-filters.test.ts` — `sortQueue` : 4 clés × 2 sens ;
      départage par date décroissante à valeur égale ; `STATUS_SORT_ORDER`
      respecté (`PENDING_REVIEW` en tête, `UNPUBLISHED` en fin).
- [x] **T21** [P] — `queue-filters.test.ts` — `loadState`/`saveState` :
      `loadState()` initial → `null` ; aller-retour `saveState` puis `loadState`
      rend l'état enregistré.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Critères d'acceptation de `spec.md` revus 1 à 1 (code) ; reste (
      vérif manuelle recette : dépliage mobile, `aria-sort`, `Select` mobile
      « Trier par », bouton Réinitialiser, compteur, persistance au retour d'un
      détail)
- [x] Statut de `spec.md` → `Implémentée`
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère `spec.md` | Tâche(s) |
|---|---|
| File initiale identique (historique complet, date desc, filtres session) | T12, T14 |
| 5 filtres combinables = intersection | T6, T13, T19 |
| Période : année **ou** plage du/au | T3, T6, T13, T19 |
| Recherche titre + orateur, insensible casse/accents, robuste `null` | T1, T6, T17, T19 |
| Filtre orateur + option « Sans orateur » | T4, T6, T13, T19 |
| Tri par clic d'en-tête Date/Statut/Séquences/Ouvertures + inversion | T7, T9, T14, T20 |
| Tri statut : « à traiter » en tête | T3, T7, T20 |
| Remise à zéro en un geste | T15 |
| Filtres + tri conservés au retour d'un détail | T8, T12, T21 |
| Message explicite si zéro résultat | T16 |
| Compteur « N enregistrements » | T15 |
| Aucune donnée d'une autre église | T6 (données déjà scoping église en amont — page inchangée) |
| Parité mobile (Select « Trier par ») | T10 |

## Point tranché

Tri par **clic d'en-tête** via extension rétro-compatible de `DataTable`
(T9–T11) — conforme au plan et à la spec. Repli `Select` « Trier par » non
retenu ; la parité mobile utilise malgré tout un `Select` (T10).
