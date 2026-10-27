# Plan technique — Changer l'icône de l'application depuis Koinonia

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-10-27

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : réglage de plateforme rattaché au module `core`
  (`src/modules/core/services/app-icon.ts`, exporté par son index). `src/app/` passe par
  `@/modules/core`.
- [x] **Sécurité** : écriture réservée au Super Admin via `requireSuperAdmin()`. Ce réglage
  n'est jamais évalué dans une église, comme `/admin/backups`. Les images servies sont
  publiques par nature (icône, manifeste) et en lecture seule.
- [x] **Permissions** : aucune nouvelle permission ; le Super Admin est déjà le rôle de
  plateforme.
- [x] **Validation** :
  - Zod pour les champs texte (couleur de fond) ;
  - format **décodé** contrôlé par `sharp` pour les fichiers, comme le logo des dons
    (spec 066).
- [x] **Migration** Prisma `add_app_icon`.
- [x] **Enums** : aucun.
- [x] **UI** : `PageHeader`, `Button`, `Alert`, `ConfirmModal`, `Field`/`Input`, `useToast`.

## Approche générale

1. **Les images vivent en base**, pas sur S3. Un jeu complet pèse environ 100 Ko :
   - il est remplacé d'un bloc dans une transaction ;
   - il est inclus dans les sauvegardes ;
   - il fonctionne aussi sur une instance sans stockage S3.
2. **Une seule adresse publique** sert les icônes, quelle que soit leur origine :
   `/api/app-icon/<variante>.png`.
   - Si une icône est déposée, l'image vient de la base.
   - Sinon, une **redirection 302** renvoie vers le fichier livré dans `public/brand/`.
   - Le service worker, le manifeste et le layout pointent toujours vers cette adresse, avec
     `?v=<version>` pour forcer le rechargement après un changement.
3. **Le manifeste devient dynamique** (`/api/app-icon/manifest`), avec le même contenu que
   `public/manifest.json` aujourd'hui, mais des icônes versionnées. `public/manifest.json` est
   supprimé.
4. **La génération des tailles** reprend la logique de `scripts/generate-app-icons.mjs`
   (spec 068) dans un service :
   - remplissage des coins clairs ou transparents par la couleur de fond ;
   - variantes 192, 512, masquable 512 (zone sûre de 72 %), `apple-touch` 180 et favicon 48.
   - Le script reste l'outil qui produit les **icônes par défaut** livrées dans le dépôt.
5. **Badge** :
   - silhouette **déposée à part** (PNG avec transparence, rendue blanche) ;
   - à défaut, une **cloche générique** livrée (`/brand/badge-bell-96.png`) ;
   - quand l'icône par défaut est en vigueur, le badge « K » livré reste utilisé.

## Modèle de données

```prisma
/// Variante d'icône de l'application déposée par un Super Admin (spec 069). Absence de ligne :
/// l'icône livrée dans `public/brand/` s'applique. Un jeu complet partage la même `version`.
model AppIconVariant {
  /// "icon-192" | "icon-512" | "icon-maskable-512" | "apple-touch-180" | "favicon-48" | "badge-96"
  variant     String   @id @db.VarChar(40)
  data        Bytes    @db.MediumBlob
  /// Empreinte courte du jeu (cache-busting `?v=`), changée à chaque dépôt.
  version     String   @db.VarChar(32)
  /// Couleur de fond utilisée pour remplir les coins (#rrggbb), conservée pour l'écran.
  background  String?  @db.Char(7)
  updatedById String?
  updatedAt   DateTime @updatedAt
  updatedBy   User?    @relation("AppIconUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  @@map("app_icon_variants")
}
```

- Migration `add_app_icon`, qui ne fait que créer la table.
- Relation inverse `appIconsUpdated` sur `User`.
- La source déposée n'est **pas conservée** : seules les variantes produites le sont, ce qui
  satisfait le critère « jamais servi tel quel ».

## API

Toutes déclarées dans le manifeste `core` :
- `/admin/app-icon` en `authenticated` ;
- `/api/admin/app-icon` en `api` ;
- `/api/app-icon` en `public`, avec `method: "GET"`.

Chacune a son `contract.ts`, et `npm run openapi` est relancé.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/admin/app-icon` | GET | `superAdmin` | — | `{ custom, version, background, hasBadge, updatedAt, updatedBy, history[] }` |
| `/api/admin/app-icon/preview` | POST | `superAdmin` | `multipart` : `icon` (fichier), `background?` (#rrggbb) | aperçus PNG en data URL, couleur proposée ; **rien n'est enregistré** |
| `/api/admin/app-icon` | PUT | `superAdmin` | `multipart` : `icon`, `background`, `badge?` (fichier) | état à jour |
| `/api/admin/app-icon` | DELETE | `superAdmin` | `{ target: "icon" \| "badge" }` | état à jour |
| `/api/app-icon/[variant]` | GET | `public` | `variant` ∈ liste fermée | PNG (`Cache-Control: public, max-age=31536000, immutable` si `?v=` correspond, sinon `max-age=300`) ou 302 vers le défaut |
| `/api/app-icon/manifest` | GET | `public` | — | manifeste PWA (`application/manifest+json`) |

**Règles de dépôt** (`normalizeAppIcon`, `src/modules/core/services/app-icon.ts`) :
- **Poids** : 5 Mo au plus, contrôlé avant décodage.
- **Format décodé** : PNG, JPEG ou WebP ; un SVG ou un GIF est refusé, quel que soit son nom.
  `limitInputPixels` est appliqué.
- **Dimensions** : carré à 2 % près, 512 px au moins ; sinon `400` avec un message explicite.
- **Couleur de fond** : `#rrggbb` validée par Zod. À défaut, elle est proposée par
  échantillonnage du bord de l'image, hors coins.
- **Badge** : PNG ou WebP **avec canal alpha**, sinon `400`. Seule l'opacité est gardée,
  l'image est rendue en blanc, puis réduite à 96 px.
- **Enregistrement** : remplacement transactionnel de toutes les variantes, avec une nouvelle
  `version`, puis `logAudit({ userId, churchId: undefined, action, entityType: "AppIcon", entityId: "app" })`.
- **Retrait** : suppression des variantes (icône, ou badge seul), puis journal.

## Services / logique métier

`src/modules/core/services/app-icon.ts`, exporté par `@/modules/core` :

- `normalizeAppIcon(buffer)` et `normalizeBadge(buffer)` : contrôles et décodage, avec des
  erreurs `ApiError(400)` lisibles.
- `suggestBackground(buffer)` : couleur médiane d'une bande prise à 8 % des bords, hors coins.
- `renderAppIconVariants(buffer, background)` : produit les variantes.
  - Masque arrondi intérieur, puis fond plein, sur le même principe que le script.
  - Fonction **pure sur buffers**, testable sans base.
- `getAppIconState()`, `setAppIcon(...)`, `setAppIconBadge(...)` et `removeAppIcon(target)`.
- `getAppIconVariant(variant)` : renvoie `{ data, version } | null`.
- `getAppIconVersion()` : la version courante, ou `"default"`, mise en cache 60 s en mémoire
  (le root layout l'appelle à chaque rendu).
- `appIconUrl(variant, version)` : l'adresse versionnée.
- Factorisation : la logique « coins remplis » est extraite dans
  `src/modules/core/services/app-icon-render.ts`, réutilisée par
  `scripts/generate-app-icons.mjs`, qui l'importe via `tsx`.

## UI / composants

- **Page `/admin/app-icon`** (serveur) : `requireAuth`, puis redirection si l'utilisateur n'est
  pas Super Admin, comme `/admin/backups`.
  - Le composant client `AppIconClient` affiche :
    - **l'icône en vigueur**, avec un badge « Par défaut » ou « Personnalisée » ;
    - un **aperçu en quatre formes**, rendu en CSS sur les variantes produites :
      - iPhone : coins arrondis ;
      - Android : masque rond sur la variante masquable ;
      - onglet du navigateur : favicon 16/32 px ;
      - notification : badge blanc sur fond sombre, à côté de l'icône 192.
  - **Dépôt** :
    - choix du fichier ;
    - appel à `preview`, qui affiche les aperçus et la couleur proposée ;
    - la couleur se modifie avec un `Input` de type couleur et un champ hexadécimal ;
    - aide sur les règles d'une bonne icône ;
    - bouton « Enregistrer l'icône ».
  - **Badge** : dépôt facultatif, avec son aperçu.
  - **« Revenir à l'icône par défaut »** et **« Retirer la silhouette »**, tous deux avec
    `ConfirmModal`.
  - **`Alert` informatif** : l'iPhone ne met pas à jour une application déjà installée ;
    Android le fait en quelques jours. Un texte d'annonce est proposé à copier.
  - **Historique** : les 20 derniers changements (`AuditLog`, `entityType: "AppIcon"`), avec
    l'auteur et la date. Le journal par église ne montre pas les entrées de plateforme, d'où
    l'historique sur l'écran lui-même.
- **Navigation** : entrée « Icône de l'application » dans `configLinksDef`, en
  `superAdminOnly`, et `CONFIG_BLOCKS["/admin/app-icon"] = "Plateforme"`.
- **Root layout** (`src/app/layout.tsx`) :
  - `metadata.manifest` devient `/api/app-icon/manifest?v=<version>`, via `generateMetadata` ;
  - l'icône et l'`apple-touch-icon` pointent vers `/api/app-icon/...?v=<version>`.
- **Service worker** :
  - icône et badge de notification passent à `/api/app-icon/icon-192.png` et `badge-96.png` ;
  - la liste du cache statique est ajustée, et `CACHE_NAME` passe à `koinonia-v5`.
- **Ressources livrées** : `public/brand/badge-bell-96.png` (cloche blanche), générée une fois.

## Décisions & alternatives écartées

- **Choix** : stockage en base (`MediumBlob`).
  - *Pourquoi* : petits volumes, remplacement atomique, inclus dans les sauvegardes, aucune
    dépendance à S3 (optionnel en développement).
  - **Écarté : S3 comme pour le logo des dons**. *Raison* : appel réseau sur un chemin servi à
    chaque chargement d'onglet ; un remplacement en deux temps (téléversement puis base) moins
    sûr ; une instance sans S3 privée de la fonction.
- **Choix** : adresse unique `/api/app-icon/*`, avec une redirection vers le défaut.
  - *Pourquoi* : le service worker et les notifications utilisent une adresse fixe, quel que
    soit l'état ; aucun code ne bascule entre deux sources.
- **Choix** : manifeste servi par une route, plutôt que par `app/manifest.ts`.
  - *Pourquoi* : `app/manifest.ts` est pré-rendu au build, sans base disponible.
  - **Écarté : garder `public/manifest.json`**. *Raison* : figé, il ne suivrait pas une icône
    déposée.
- **Choix** : la source déposée n'est pas conservée.
  - *Pourquoi* : le critère interdit de la servir telle quelle, et la conserver n'apporterait
    rien.
  - Pour changer de couleur de fond, il faut redéposer l'image. *Limite assumée, comme la
    spec qui exclut la retouche.*
- **Choix** : badge déposé à part, avec une cloche générique à défaut (décision de la spec).
  - **Écarté : extraire automatiquement une silhouette** de l'icône. *Raison* : résultat
    imprévisible selon l'image ; le badge de la spec 068 a demandé un réglage à la main.
- **Choix** : le module `core` porte le service. C'est un réglage de plateforme, au même titre
  que les sauvegardes et les églises.

## Risques & points d'attention

- **Requête à chaque rendu** : la version est lue dans le root layout, d'où le cache mémoire de
  60 s. Un changement est visible au plus une minute après sur chaque processus. Négligeable.
- **Caches navigateur et CDN** : les adresses sont versionnées (`?v=`), avec un cache immuable
  quand la version correspond. Une version périmée garde un cache court pour converger.
- **Taille des requêtes** : le dépôt passe en `multipart`. Il faut vérifier la limite de corps
  des route handlers (Next 16) et la limite de Traefik pour 5 Mo + 5 Mo. Le dépôt du logo des
  dons (2 Mo) passe déjà par ce chemin.
- **Décodage d'images** : `limitInputPixels`, `failOn: "error"` et un format décodé contrôlé,
  comme dans la spec 066, pour se protéger des images malformées ou des bombes de
  décompression.
- **iOS** : une application déjà installée garde l'ancienne icône. C'est dit sur l'écran et
  dans le texte d'annonce proposé.
- **Proxy** : les adresses `/api/app-icon/*.png` contiennent un point et échappent au matcher
  du proxy. `/api/app-icon/manifest` est déclarée publique. Cohérent avec l'accès public
  voulu.

## Stratégie de tests

Vitest, Prisma mocké, et `sharp` réel sur de petites images générées en mémoire.

- **`app-icon.test.ts`** (service) :
  - refus : SVG, GIF, image non carrée, image de moins de 512 px, fichier de plus de 5 Mo,
    fichier qui n'est pas une image ;
  - badge sans canal alpha refusé ;
  - `suggestBackground` sur une image à coins blancs et fond violet ;
  - `renderAppIconVariants` : bonnes dimensions, coins **pleins** (pixel d'angle égal à la
    couleur de fond), aucune transparence sauf sur le badge ;
  - `setAppIcon` : remplacement transactionnel, nouvelle version, journal `AppIcon` ;
  - `removeAppIcon("icon")` et `("badge")`.
- **Routes** :
  - `/api/admin/app-icon*` : `403` pour un Admin d'église, `200` pour un Super Admin, `400`
    sur une image refusée sans changement en base ;
  - `/api/app-icon/[variant]` :
    - variante inconnue : `404` ;
    - pas d'icône : `302` vers le défaut ;
    - icône déposée : PNG et en-têtes de cache ;
    - badge absent sous icône personnalisée : redirection vers la cloche.
  - `/api/app-icon/manifest` : icônes versionnées.
- **Navigation** : entrée visible du seul Super Admin (instantané `layout-props`).
- **Contrats** : `openapi.test.ts` et `route-exhaustiveness.test.ts`.
- **Hors Vitest** (recette staging) :
  - dépôt puis aperçu ;
  - favicon et notification Android avec la nouvelle icône ;
  - installation neuve sur iPhone et Android ;
  - retour au défaut.
