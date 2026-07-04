# Plan technique — Sauvegarde partielle — export et restauration de la configuration

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-04

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : pas de nouveau module — logique dans `src/lib/`, routes sous `src/app/api/admin/backups/`
- [x] **Sécurité** : toutes les routes vérifiées via `session.user.isSuperAdmin` (même pattern que les routes backup existantes)
- [x] **Permissions** : `isSuperAdmin` est le seul check requis (pas de permission RBAC custom — cohérent avec l'existant)
- [x] **Validation** Zod sur toutes les mutations (import, export)
- [x] **Migration** Prisma : aucun changement de schéma — feature purement applicative
- [x] **Enums** : Role importé depuis `@/generated/prisma/client` dans le service d'import
- [x] **UI** : composants `src/components/ui/` réutilisés (Modal, Button, CheckboxGroup)

## Approche générale

Pas de changement de schéma. La feature est entièrement applicative : deux nouveaux services
(`src/lib/config-export.ts`, `src/lib/config-import.ts`), trois nouvelles routes API sous
`/api/admin/backups/config/`, et un nouveau composant client `ConfigBackupClient.tsx` intégré
à la page `/admin/backups` existante.

L'export sérialise les entités de configuration en un JSON autonome (avec métadonnées de version).
L'import analyse ce JSON, détecte les conflits, et applique la stratégie choisie dans une
transaction Prisma unique — garantissant l'atomicité.

## Modèle de données

**Aucun changement de schéma Prisma.**

### Format du fichier JSON exporté

```typescript
interface KoinoniaConfigExport {
  _meta: {
    appVersion: string;       // ex: "1.12.0"
    exportedAt: string;       // ISO 8601
    exportedBy: string;       // email du Super Admin
    schemaVersion: number;    // version du format, actuellement 1
    scope: "all" | string[];  // churchIds ou "all"
    categories: ConfigCategory[];
  };
  churches: ChurchConfig[];
}

type ConfigCategory = "structure" | "members" | "links";

interface ChurchConfig {
  id: string;
  name: string;
  slug: string;
  secretariatEmail: string | null;
  accountingEmail: string | null;
  primaryColor: string;
  ministries: MinistryConfig[];   // si "structure" sélectionné
  members: MemberConfig[];        // si "members" sélectionné
  userLinks: UserLinkConfig[];    // si "links" sélectionné
  userRoles: UserRoleConfig[];    // si "links" sélectionné
}

interface MinistryConfig {
  id: string;
  name: string;
  isSystem: boolean;
  departments: DepartmentConfig[];
}

interface DepartmentConfig {
  id: string;
  name: string;
  isSystem: boolean;
  function: string | null;
}

interface MemberConfig {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  departmentIds: string[];  // IDs des départements dans ce même export
  isPrimaryDeptId: string | null;
}

interface UserLinkConfig {
  memberId: string;
  userEmail: string;    // email pour retrouver l'User sur la cible
  churchId: string;
  validatedAt: string | null;
}

interface UserRoleConfig {
  userEmail: string;
  role: string;         // valeur de l'enum Role
  ministryId: string | null;
  departmentIds: string[];
}
```

`schemaVersion: 1` permet de rejeter les fichiers d'un format futur incompatible.

## API

| Endpoint | Méthode | Auth | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/admin/backups/config/export` | POST | `isSuperAdmin` | `{ scope: string[] \| "all", categories: ConfigCategory[] }` | Fichier JSON (Content-Disposition: attachment) |
| `/api/admin/backups/config/import/preview` | POST | `isSuperAdmin` | body JSON = `KoinoniaConfigExport` | `ImportPreview` |
| `/api/admin/backups/config/import` | POST | `isSuperAdmin` | `{ data: KoinoniaConfigExport, strategy: MergeStrategy, categories: ConfigCategory[] }` | `ImportResult` |

```typescript
type MergeStrategy = "SKIP" | "UPDATE" | "REPLACE";

interface ImportPreview {
  schemaVersion: number;
  exportedAt: string;
  churches: {
    id: string;
    name: string;
    slug: string;
    existsInTarget: boolean;
  }[];
  counts: {
    ministries: number;
    departments: number;
    members: number;
    userLinks: number;
    userRoles: number;
  };
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  warnings: string[];   // ex: "Département X ignoré car il a des plannings associés"
}
```

### Schémas Zod

```typescript
// Export
const exportSchema = z.object({
  scope: z.union([z.literal("all"), z.array(z.string().cuid())]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});

// Import
const importSchema = z.object({
  data: z.object({
    _meta: z.object({
      schemaVersion: z.literal(1),
      appVersion: z.string(),
      exportedAt: z.string(),
      categories: z.array(z.string()),
    }),
    churches: z.array(z.object({ id: z.string(), /* … */ })),
  }),
  strategy: z.enum(["SKIP", "UPDATE", "REPLACE"]),
  categories: z.array(z.enum(["structure", "members", "links"])).min(1),
});
```

L'endpoint `/preview` utilise le même schéma de validation du fichier (`data`) sans `strategy`.

## Services / logique métier

### `src/lib/config-export.ts`

```typescript
export async function exportConfig(
  scope: "all" | string[],
  categories: ConfigCategory[],
  exportedBy: string,
  appVersion: string
): Promise<KoinoniaConfigExport>
```

- Charge les églises ciblées avec leurs ministères, départements, membres, liens via Prisma.
- Pour les membres : jointure via `MemberDepartment → Department → Ministry → Church` pour
  trouver les membres appartenant aux églises exportées.
- Pour les liens : charge `MemberUserLink` (avec `user.email`) et `UserChurchRole`
  (avec `user.email`, `ministryId`, et `UserDepartment`).
- Retourne l'objet `KoinoniaConfigExport` sérialisable en JSON.

### `src/lib/config-import.ts`

```typescript
export async function previewImport(
  data: KoinoniaConfigExport
): Promise<ImportPreview>

export async function applyImport(
  data: KoinoniaConfigExport,
  strategy: MergeStrategy,
  categories: ConfigCategory[]
): Promise<ImportResult>
```

#### Stratégies d'import

**SKIP** : pour chaque entité, `upsert` avec `update: {}` — crée si absent, ignore si présent.

**UPDATE** : pour chaque entité, `upsert` avec mise à jour des champs — crée ou écrase.

**REPLACE** :
1. **Structure** : pour chaque église du fichier, dans une transaction :
   - Upsert les ministères/départements présents dans le fichier.
   - Pour les départements existants en base absents du fichier : tenter la suppression ;
     si la contrainte FK échoue (planning, event, tâche associée), logger un warning et skiper.
   - Même logique pour les ministères orphelins.
2. **Members** : upsert tous les membres + leurs `MemberDepartment` ;
   supprimer les `MemberDepartment` pour les membres-église hors fichier ;
   supprimer les membres qui n'ont plus aucun département après nettoyage.
3. **Links** : supprimer tous les `MemberUserLink` et `UserChurchRole` de l'église,
   puis recréer depuis le fichier (résolution user par email — user inexistant → warning + skip).

**Atomicité** : `applyImport` s'exécute dans une seule `prisma.$transaction([...])` (transaction
interactive). En cas d'erreur, tout est annulé.

**Ordre d'insertion** respecté : Church → Ministry → Department → Member → MemberDepartment →
MemberUserLink → UserChurchRole → UserDepartment (contraintes FK).

## UI / composants

### Page `/admin/backups`

La page existante reste inchangée. On ajoute un nouveau composant client `ConfigBackupClient.tsx`
rendu sous la section existante `BackupsClient`.

```
BackupsPage (server)
├── BackupsClient      — dump SQL complet (existant, inchangé)
└── ConfigBackupClient — export/import config (nouveau)
```

### `ConfigBackupClient.tsx` — deux sections

**Section Export**
- Sélecteur d'église : radio "Toutes" ou liste déroulante (churches chargées via fetch)
- Cases à cocher catégories : Structure / Membres / Liaisons & rôles
- Bouton "Exporter" → POST `/api/admin/backups/config/export` → déclenchement download navigateur

**Section Import**
1. Input `<input type="file" accept=".json">` + bouton "Analyser"
2. POST preview → affiche `ImportPreviewModal` :
   - Résumé (N ministères, N départements, N membres, N liens)
   - Liste des églises trouvées dans le fichier + indicateur "existe / nouvelle"
   - Sélecteur de stratégie (radio SKIP / UPDATE / REPLACE avec descriptions)
   - Cases à cocher catégories à importer (pré-cochées selon le contenu du fichier)
   - Bouton "Confirmer l'import"
3. POST import → affiche rapport final (créés / mis à jour / ignorés / erreurs / warnings)

Composants UI réutilisés : `Modal`, `Button`, `CheckboxGroup`.

## Décisions & alternatives écartées

- **JSON téléchargeable plutôt que stocké S3** : décision spec (à la demande, pas d'auto-upload).
  Simplifie l'implémentation, pas de dépendance S3 pour cette feature.

- **Pas de schéma Prisma modifié** : toutes les données nécessaires sont déjà modélisées.
  Ajouter une table de "snapshots" aurait été du sur-engineering.

- **Transaction interactive Prisma (`$transaction` avec callback)** plutôt que transactions
  séquentielles : garantit l'atomicité sur des opérations conditionnelles complexes.
  Alternative `prisma.$transaction([...])` (tableau) écartée car insuffisante pour les branches
  conditionnelles (strategy REPLACE).

- **Résolution user par email** pour les liaisons (plutôt que par ID) : les IDs d'un User
  sont propres à chaque instance ; l'email est la clé naturelle cross-instance.

- **Stratégie unique par import** (non par catégorie) : simplifie l'UX et les cas limites.
  La spec ne demandait pas de granularité par catégorie.

- **Import via body JSON** (pas multipart/form-data) : le fichier est du texte structuré,
  taille typiquement < 1 Mo, envoyable en JSON natif. Évite la complexité du parsing multipart
  côté serveur Next.js. Le client lit le fichier via `FileReader.readAsText()`.

## Risques & points d'attention

1. **FK constraints sur REPLACE structure** : supprimer un département qui a des plannings
   ou événements associés échouera silencieusement côté MariaDB (RESTRICT). Le service doit
   détecter ce cas avant la transaction et remonter un warning lisible.

2. **Membre sans churchId** : les `Member` ne portent pas de `churchId` — leur rattachement
   à une église passe par `MemberDepartment → Department → Ministry → Church`. La logique
   d'export et de REPLACE doit traverser cette chaîne correctement.

3. **Users inexistants sur la cible** : lors d'un import de liaisons, l'email d'un user présent
   dans le fichier peut ne pas exister sur l'instance cible (compte jamais créé). → Skip + warning.

4. **Taille du fichier** : avec de nombreux membres (> 2 000), le JSON peut dépasser quelques Mo.
   Le body parser Next.js supporte jusqu'à 4 Mo par défaut — suffisant pour la V1.
   Documenter cette limite dans les warnings UI si `members.length > 1 500`.

5. **Concurrence** : deux imports simultanés sur la même église pourraient se marcher dessus.
   Acceptable en V1 (usage Super Admin, rare). Pas de verrou distribué prévu.

## Stratégie de tests

Tests Vitest dans `src/app/api/admin/__tests__/config-backup.test.ts` :

- `exportConfig()` : vérifie la structure du JSON produit (métadonnées, counts, format)
- `previewImport()` : vérifie les counts et la détection "existe / nouvelle"
- `applyImport()` stratégie SKIP : entité existante non modifiée, nouvelle créée
- `applyImport()` stratégie UPDATE : entité existante mise à jour
- `applyImport()` stratégie REPLACE structure : upsert + warning sur département avec FK
- `applyImport()` liaisons : skip + warning si user email inconnu
- `applyImport()` fichier schemaVersion incompatible : rejeté avant toute écriture
- Routes API : 403 pour non-Super Admin sur export et import
