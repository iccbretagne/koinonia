# Tâches — Sauvegarde partielle — export et restauration de la configuration

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/sauvegarde-partielle`
- [x] Pas de migration Prisma (aucun changement de schéma)

## Tâches

### 1. Types partagés

- [x] **T1** — Créer le fichier de types TypeScript `KoinoniaConfigExport`, `ChurchConfig`,
  `MinistryConfig`, `DepartmentConfig`, `MemberConfig`, `UserLinkConfig`, `UserRoleConfig`,
  `MergeStrategy`, `ConfigCategory`, `ImportPreview`, `ImportResult`
  *(fichier : `src/lib/config-backup-types.ts`)*

### 2. Services

- [x] **T2** — Implémenter `exportConfig(scope, categories, exportedBy, appVersion)` :
  charge les églises ciblées, sérialise ministères/départements, membres (via
  `MemberDepartment → Department → Ministry → Church`), liens (`MemberUserLink` + `UserChurchRole`
  avec résolution email), retourne `KoinoniaConfigExport`
  *(fichier : `src/lib/config-export.ts`)*

- [x] **T3** — Implémenter `previewImport(data)` : valide `schemaVersion === 1`,
  compte les entités du fichier, détecte lesquelles existent en base (par ID),
  retourne `ImportPreview`
  *(fichier : `src/lib/config-import.ts`)*

- [x] **T4** — Implémenter `applyImport(data, strategy, categories)` dans une transaction
  Prisma interactive :
  - Stratégie SKIP : upsert `update: {}` pour chaque entité
  - Stratégie UPDATE : upsert avec mise à jour des champs
  - Stratégie REPLACE : upsert + détection et suppression des orphelins (avec catch FK +
    warning), suppression/recréation des liens
  - Ordre d'insertion : Church → Ministry → Department → Member → MemberDepartment →
    MemberUserLink → UserChurchRole → UserDepartment
  - Résolution user par email ; user introuvable → skip + warning
  - Retourne `ImportResult` (created/updated/skipped/errors/warnings)
  *(fichier : `src/lib/config-import.ts`)*

### 3. API

- [x] **T5** [P] — Route `POST /api/admin/backups/config/export` : `requireAuth` +
  vérif `isSuperAdmin`, validation Zod `exportSchema`, appel `exportConfig()`,
  réponse `Content-Disposition: attachment; filename="koinonia-config-{date}.json"`,
  `logAudit` action CREATE entityType ConfigExport
  *(fichier : `src/app/api/admin/backups/config/export/route.ts`)*

- [x] **T6** [P] — Route `POST /api/admin/backups/config/import/preview` : `requireAuth` +
  vérif `isSuperAdmin`, validation Zod du corps (schemaVersion 1 obligatoire), appel
  `previewImport()`, retourne `ImportPreview`
  *(fichier : `src/app/api/admin/backups/config/import/preview/route.ts`)*

- [x] **T7** [P] — Route `POST /api/admin/backups/config/import` : `requireAuth` +
  vérif `isSuperAdmin`, validation Zod `importSchema`, appel `applyImport()`,
  `logAudit` action UPDATE entityType ConfigImport avec résumé (created/updated/skipped),
  retourne `ImportResult`
  *(fichier : `src/app/api/admin/backups/config/import/route.ts`)*

### 4. UI

- [x] **T8** — Créer `ConfigBackupClient` — section Export :
  - Fetch GET `/api/admin/churches` (ou liste statique) pour le sélecteur d'église
  - Sélecteur scope : radio "Toutes les églises" / liste déroulante église spécifique
  - Cases à cocher catégories : Structure / Membres / Liaisons & rôles (via `CheckboxGroup`)
  - Bouton "Exporter" → POST export → `FileReader` + `URL.createObjectURL` pour déclencher
    le téléchargement du JSON
  *(fichier : `src/app/(auth)/admin/backups/ConfigBackupClient.tsx`)*

- [x] **T9** — Ajouter section Import à `ConfigBackupClient` :
  - `<input type="file" accept=".json">` + bouton "Analyser"
  - Lecture fichier via `FileReader.readAsText()`, parse JSON, POST preview
  - `ImportPreviewModal` : résumé counts, liste églises (existe/nouvelle), radio stratégie
    (SKIP / UPDATE / REPLACE avec descriptions), cases catégories, bouton "Confirmer"
  - POST import → affiche rapport final (compteurs + warnings)
  - Réutilise `Modal`, `Button`, `CheckboxGroup` de `src/components/ui/`
  *(fichier : `src/app/(auth)/admin/backups/ConfigBackupClient.tsx`)*

- [x] **T10** — Intégrer `ConfigBackupClient` dans la page `/admin/backups` :
  importer et rendre sous `BackupsClient` existant, avec un titre de section
  "Configuration structurelle"
  *(fichier : `src/app/(auth)/admin/backups/page.tsx`)*

### 5. Tests

- [x] **T11** [P] — Tests unitaires `exportConfig` : vérifie la structure du JSON produit
  (présence `_meta`, counts corrects pour chaque catégorie, résolution email dans userLinks)
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

- [x] **T12** [P] — Tests unitaires `previewImport` : fichier valide → counts corrects ;
  `schemaVersion !== 1` → erreur ; détection "existe / nouvelle" pour une église
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

- [x] **T13** [P] — Tests unitaires `applyImport` stratégie SKIP :
  entité existante (même ID) → non modifiée ; nouvelle entité → créée ;
  `created` et `skipped` corrects dans `ImportResult`
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

- [x] **T14** [P] — Tests unitaires `applyImport` stratégie UPDATE :
  entité existante → champs mis à jour ; nouvelle → créée
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

- [x] **T15** [P] — Tests unitaires `applyImport` stratégie REPLACE :
  département orphelin sans FK → supprimé ; département avec FK → skipped + warning ;
  liens recréés depuis le fichier ; user email introuvable → skip + warning
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

- [x] **T16** [P] — Tests routes API : 403 non-Super Admin sur export, preview et import ;
  400 sur fichier invalide (JSON malformé, schemaVersion incorrecte)
  *(fichier : `src/app/api/admin/__tests__/config-backup.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] **CA1** — Super Admin peut exporter un JSON de la configuration d'une église
- [x] **CA2** — Le fichier exporté est autonome et contient toutes les métadonnées
- [x] **CA3** — Super Admin peut importer et voir un résumé avant de confirmer
- [x] **CA4** — Import stratégie SKIP : entités existantes non modifiées
- [x] **CA5** — Import stratégie UPDATE : entités existantes mises à jour
- [x] **CA6** — Fichier invalide rejeté avant toute modification
- [x] **CA7** — Import interrompu par erreur : base non partiellement modifiée (transaction)
- [x] **CA8** — Rapport post-import : created / updated / skipped / errors
- [x] **CA9** — Export et import réservés au Super Admin (403 sinon)
- [x] **CA10** — Opération journalisée en audit
- [x] PR ouverte vers `main`
