# Tâches — Export Excel des demandes d'intégration

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : En cours (code + tests livrés ; recette T14 en attente de Docker)

> Tâches **ordonnées** et **vérifiables**. Les tâches `[P]` sont parallélisables
> (fichiers réellement indépendants).
>
> ⚠️ **Aucune migration Prisma** (cf. `plan.md` D4 : `AuditLog.action` est déjà un `String`).
> Le travail commence donc au socle partagé, puis module → API → UI → tests.

## Prérequis

- [x] Branche créée : `feat/export-demandes-integration` (depuis `main` à jour)
- [x] Migration Prisma — **sans objet**, aucun changement de schéma
- [x] Vérifier que `prisma/migrations/20260614095330_init_macbook_dev_env/` (non suivi,
      artefact local) **n'est pas** ajouté au commit

## Tâches

### 1. Données & migration

*Sans objet — aucun changement de `prisma/schema.prisma`.*

### 2. Socle partagé

- [x] **T1** `[P]` — Créer le helper de neutralisation anti-formule, extrait des **trois
      copies identiques** existantes : `sanitizeExcelValue(value)` (préfixe d'une apostrophe
      toute chaîne commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot) et
      `sanitizeRow(row)`. Comportement **strictement identique** aux copies actuelles — on
      déplace, on ne redéfinit pas.
      *(fichier : `src/lib/excel.ts`)*

- [x] **T2** `[P]` — Élargir le type de `logAudit` : `action` accepte désormais `"EXPORT"`
      en plus de `"CREATE" | "UPDATE" | "DELETE"`. **Aucune migration** — la colonne est
      déjà un `String` ; mettre à jour le commentaire du modèle dans `prisma/schema.prisma`
      pour refléter la nouvelle valeur (commentaire seul, pas de changement de schéma).
      *(fichiers : `src/lib/audit.ts`, `prisma/schema.prisma` — commentaire uniquement)*

- [x] **T3** — Raccorder les **trois routes d'export existantes** à `@/lib/excel` :
      supprimer leur copie locale de `sanitizeExcelValue` / `sanitizeRow` et importer le
      helper. Modification **strictement mécanique** : aucune autre retouche dans ces
      fichiers, aucun changement de comportement (cf. `plan.md` risque n°5).
      *(fichiers : `src/app/api/absences/export/route.ts`,
      `src/app/api/discipleships/export/route.ts`,
      `src/app/api/events/reports/export/route.ts`)*
      *(dépend de T1)*

- [x] **T4** `[P]` — Ajouter le libellé **« Export »** à la table `ACTION_LABELS` du journal
      d'audit (couleur distincte des trois existantes). Sans cela le journal afficherait le
      code brut via son repli.
      *(fichier : `src/app/(auth)/admin/audit-logs/AuditLogsClient.tsx`)*

### 3. Logique métier (module intégration)

- [x] **T5** `[P]` — Ajouter la garde d'export `requireIntegrationExportAccess(churchId)` :
      elle réutilise `requireIntegrationAccess(churchId)` puis **refuse un périmètre
      restreint** (`scope.scoped === true` → berger/co-berger) avec un `ApiError(403, …)`.
      La règle « extraire est plus strict que consulter » appartient au module, pas au
      handler.
      *(fichier : `src/modules/integration/auth.ts`)*

- [x] **T6** `[P]` — Créer le service de projection, **fonction pure** sans Prisma ni I/O :
      `EXPORT_COLUMNS` (les **18 en-têtes**, dans l'ordre de la spec) et
      `buildIntegrationExportRows(requests)`. Il porte :
      - les tables de correspondance vers les **libellés affichés à l'écran** (statut,
        tranche d'âge, statut d'église) — jamais de code interne dans le fichier ;
      - `salvationCall` / `pastoralCareRequested` → **`Oui` / `Non`** ;
      - dates au format français, **chaîne vide** pour une étape non atteinte ;
      - champs `null` → **chaîne vide**, jamais `"null"` ;
      - **exclusion** des notes internes, du motif d'abandon et de l'adresse postale
        précise (seule la ville figure).
      *(fichier : `src/modules/integration/services/export-service.ts`)*

- [x] **T7** — Exporter `requireIntegrationExportAccess`, `buildIntegrationExportRows` et
      `EXPORT_COLUMNS` depuis l'index du module — c'est le **seul** point d'entrée autorisé
      pour `src/app/` (constitution §I).
      *(fichier : `src/modules/integration/index.ts`)*
      *(dépend de T5, T6)*

### 4. API (route handler)

- [x] **T8** — Créer `POST /api/integration/requests/export` :
      1. valider le corps avec **Zod** : `{ churchId: string, requestIds: string[] }`,
         borné à **1..2000** ;
      2. `requireIntegrationExportAccess(churchId)` ;
      3. requête Prisma avec `id: { in: requestIds }` **ET** `churchId` **ET**
         `archivedAt: null` — les deux derniers critères réimposés serveur, jamais déduits
         du corps reçu ; inclure `assignedBerger` ;
      4. `buildIntegrationExportRows` → `sanitizeRow` → classeur ExcelJS ;
      5. `logAudit` avec `action: "EXPORT"` et le **nombre de lignes réellement écrites**
         (pas le nombre d'identifiants reçus) ;
      6. réponse : type MIME xlsx + `Content-Disposition: attachment` avec un nom daté
         `demandes-integration-AAAA-MM-JJ.xlsx`.
      Erreurs via `errorResponse` (403 sur `FORBIDDEN`, 400 sur `ZodError`).
      *(fichier : `src/app/api/integration/requests/export/route.ts`)*
      *(dépend de T1, T2, T7)*

### 5. UI

- [x] **T9** — Transmettre au tableau de bord les deux props nécessaires : `churchId` et
      `canExport={!scope.scoped}`. **Aucune requête supplémentaire** — `churchId` et `scope`
      sont déjà calculés par la page.
      *(fichier : `src/app/(auth)/integration/requests/page.tsx`)*

- [x] **T10** — Ajouter le bouton **« Exporter (N) »** (composant `Button` de
      `src/components/ui/`, rappel : pas de prop `loading`, utiliser `disabled`) :
      - rendu **seulement si `canExport`** ;
      - **désactivé quand `filtered.length === 0`** (on ne télécharge pas un fichier vide) ;
      - `N` = `filtered.length`, pour que le contrat soit visible **avant** le clic ;
      - au clic : `POST` avec **`filtered.map(r => r.id)`** — le tableau déjà utilisé pour
        le rendu, ce qui rend l'égalité « fichier = écran » structurelle ;
      - téléchargement par `Blob` + `URL.createObjectURL` + `link.download`, sur le patron
        de `AbsencesClient` ;
      - état `exporting` (bouton désactivé pendant la génération) et message d'erreur
        discret en cas d'échec.
      *(fichier : `src/app/(auth)/integration/requests/IntegrationDashboard.tsx`)*
      *(dépend de T8, T9)*

### 6. Tests

- [x] **T11** `[P]` — Tests du helper partagé, **aujourd'hui testé nulle part** malgré ses
      trois copies : chaîne commençant par `=`, `+`, `-`, `@`, tabulation, retour chariot →
      préfixée ; chaîne ordinaire → **inchangée** (pas de faux positif) ; valeurs
      non-chaînes (nombre, booléen, `null`, `Date`) → intactes ; `sanitizeRow` traite
      **toutes** les valeurs et préserve les clés.
      *(fichier : `src/lib/__tests__/excel.test.ts`)* *(dépend de T1)*

- [x] **T12** `[P]` — Tests du service de projection : les **18 colonnes dans l'ordre** ;
      libellés français et non codes internes (`SUBMITTED` → « En attente », `ADULT` →
      « Adulte (30–60 ans) », `VISITOR` → « Visiteur ») ; `Oui`/`Non` sur les deux
      marqueurs pastoraux ; **étape non atteinte → cellule vide** ; champs `null` → chaîne
      vide et jamais `"null"` ; **aucune clé produite ne correspond** aux notes internes, au
      motif d'abandon ou à l'adresse postale (verrouille l'exclusion décidée).
      *(fichier : `src/modules/integration/__tests__/export-service.test.ts`)*
      *(dépend de T6)*

- [x] **T13** — Tests de la route, sur le patron de
      `src/app/api/absences/export/__tests__/route.test.ts` (`prismaMock`,
      `createAdminSession`, mock de `@/lib/auth`) :
      - **403** si l'accès à l'intégration est refusé ;
      - **403** pour un **berger au périmètre restreint** — la garde métier testée pour
        elle-même, indépendamment de l'UI qui masque le bouton ;
      - **400** sur corps invalide (`churchId` manquant, `requestIds` vide ou hors plafond) ;
      - la requête Prisma filtre bien sur **`churchId`** et **`archivedAt: null`** ;
      - un identifiant **hors périmètre** n'apparaît pas dans le fichier ;
      - en-têtes de réponse : type MIME xlsx + `Content-Disposition` daté ;
      - `logAudit` appelé **une fois**, avec `action: "EXPORT"` et le **nombre de lignes
        écrites**.
      *(fichier : `src/app/api/integration/requests/export/__tests__/route.test.ts`)*
      *(dépend de T8)*

### 7. Recette

- [ ] **T14** — Recette manuelle : le rendu React n'est pas testable automatiquement
      (`vitest` en `environment: "node"`, `*.test.ts` uniquement). Vérifier :
      - **compte équipe Intégration** : bouton présent, compteur cohérent avec la liste,
        fichier téléchargé conforme (18 colonnes, libellés lisibles) ;
      - **compte berger** : **aucun** bouton d'export ;
      - **filtre statut** puis **recherche texte**, puis **les deux combinés** : le fichier
        suit à chaque fois ;
      - **filtre ne renvoyant rien** : bouton désactivé ;
      - le fichier **ne contient ni** notes internes, **ni** motif d'abandon, **ni** adresse
        postale ;
      - une demande dont le nom commence par `=` s'affiche comme **texte** dans le tableur ;
      - l'export apparaît dans `/admin/audit-logs` avec le libellé **« Export »** et le
        nombre de lignes.

## Couverture des critères d'acceptation

| Critère de `spec.md` | Tâche(s) |
|---|---|
| Action d'export proposée à l'équipe Intégration / Admin / Secrétaire / Super Admin | T9, T10 |
| Action **non** proposée à un berger au périmètre restreint | T9, T10, T14 |
| Tentative sans droit refusée même en contournant l'interface | T5, T8, T13 |
| Fichier tableur, nom contenant la date du jour | T8, T10, T13 |
| Fichier = exactement les demandes affichées (même nombre que le compteur) | T10, T8 |
| Filtre **statut** respecté | T10 |
| **Recherche texte** respectée | T10 |
| Filtres **combinés** = intersection | T10, T14 |
| Ligne d'en-têtes française, **18 colonnes** dans l'ordre | T6, T12 |
| Libellés affichés à l'écran, pas de codes internes | T6, T12 |
| « Appel au salut » / « Soin pastoral » valent **Oui**/**Non** | T6, T12 |
| Dates d'étapes non atteintes **vides** | T6, T12 |
| Ni notes internes, ni motif d'abandon, ni adresse précise | T6, T12, T14 |
| Valeur `=` `+` `-` `@` présentée comme **texte** | T1, T8, T11, T14 |
| Aucune demande d'une **autre église** | T8, T13 |
| Aucune demande **archivée** | T8, T13 |
| Entrée de **journal** (auteur, date, nombre de lignes) | T2, T4, T8, T13, T14 |
| Export de plusieurs centaines de lignes aboutit | T8 *(plafond 2000)*, T14 |

Les 18 critères de la spec sont couverts par au moins une tâche.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` — doit passer **sans modifier `.dependency-cruiser.cjs`** :
      c'est la preuve que la route n'importe le module que par son index
- [x] `npm run test` — les tests des exports **absences** doivent rester verts après T3
      (preuve que le refactor du helper est bien sans effet de bord)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (cf. tableau + T14)
- [ ] `git status` propre hors fichiers voulus — la migration locale
      `20260614095330_init_macbook_dev_env/` **reste non suivie**
- [ ] PR ouverte vers `main`, référençant la spec `specs/033-export-demandes-integration/`
