# Plan technique — Regroupement et ergonomie de la navigation

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun import interne de module ajouté ; les seuls nouveaux helpers
      vivent dans `src/lib/` (noyau) ou dans `src/app/`
- [x] **Sécurité** : chaque onglet garde son contrôle serveur existant ; le nouveau garde Collections
      prend un `churchId` obligatoire, comme les gardes médias actuels
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune permission ajoutée ni retirée
      d'un manifeste, donc pas de mise à jour de la matrice figée
- [x] **Validation** Zod : aucune nouvelle mutation ; le seul paramètre ajouté (`from`) est lu en
      liste blanche
- [x] **Migration** Prisma : aucun changement de schéma
- [x] **Enums** : aucun nouvel usage
- [x] **UI** : `Button`, `Badge` réutilisés ; un composant d'onglets générique extrait de `AudioTabs`
      (voir décisions)

## Approche générale

Quatre volets indépendants, livrés sur une seule branche `feat/navigation-regroupement`, un commit
par volet, une seule PR. Chaque volet se teste isolément en recette. Aucun changement de schéma,
aucune route API nouvelle : on réorganise des points d'entrée et on élargit un seul garde.

Fil directeur pour les volets 3 et 4 : **on ne déplace aucune page**. Les URL actuelles restent
valides, ce qui règle sans redirection le critère « anciens liens (notifications, favoris) ». On
ajoute des points d'entrée (tuiles dans le formulaire unifié, barre d'onglets) par-dessus les
pages existantes.

## Modèle de données

[Aucun changement]

## API

| Endpoint | Méthode | Changement |
|---|---|---|
| `/api/admin/media/collections` | POST | Garde `requireMediaManageAccess` → `requireMediaCollectionAccess` (ouvre à l'équipe Communication) |

Aucune autre route touchée. Les messages d'erreur des routes `announcement-sheet` sont renommés
(« feuille d'annonces » → « trame des annonces »), sans changement de comportement.

## Services / logique métier

### `src/lib/auth.ts` — nouveau garde Collections

```ts
// media:manage OU membre PRODUCTION_MEDIA OU membre COMMUNICATION
export async function requireMediaCollectionAccess(churchId: string)
```

Même structure que `requireMediaManageAccess`, avec `isCommunicationMember` en plus.
`requireMediaManageAccess` **n'est pas modifié** : il protège aussi la suppression/le partage des
projets, événements médias et fichiers (`media-projects/[id]`, `media-events/[id]`,
`media/files/[id]`, routes `share`), que la Communication ne doit pas obtenir.

Utilisé par : `src/app/(auth)/media/collections/page.tsx` et `POST /api/admin/media/collections`.
Les routes publiques `/api/media/collection/[token]/*` (consultation par lien) ne changent pas.

### `src/lib/media-space.ts` — onglets de « Communication & Production »

```ts
export interface MediaSpaceAccess {
  visuals: boolean;      // events:manage OU membre PRODUCTION_MEDIA (= garde de /media/requests)
  social: boolean;       // events:manage OU membre COMMUNICATION (= garde de /communication/requests)
  browse: boolean;       // media:view OU PRODUCTION_MEDIA OU COMMUNICATION (= requireMediaAccess)
  collections: boolean;  // media:manage OU PRODUCTION_MEDIA OU COMMUNICATION (= nouveau garde)
}
export function buildMediaSpaceTabs(access: MediaSpaceAccess): { href: string; label: string }[]
export async function resolveMediaSpaceAccess(session, churchId): Promise<MediaSpaceAccess>
```

Ordre et libellés : Demandes visuels (`/media/requests`) · Demandes réseaux sociaux
(`/communication/requests`) · Projets (`/media/projects`) · Événements médias (`/media/events`) ·
Collections (`/media/collections`).

- `buildMediaSpaceTabs` est **pur** (testable sans mock) et sert de source unique à la barre
  d'onglets **et** au lien de menu.
- `resolveMediaSpaceAccess` (1 requête département) sert aux layouts médias et à `/media`.
- Le layout `(auth)` ne l'appelle pas : il a déjà chargé les départements de service
  (`serviceDepts`, `isMemberOf`) et construit l'objet `MediaSpaceAccess` à partir de ces données,
  sans requête de plus. Les deux constructions suivent les mêmes règles, vérifiées par test.

## UI / composants

### Volet 1 — Trame des annonces + menu Événements du STAR

- **Renommage** (libellés visibles uniquement ; les identifiants de code, le modèle Prisma et les
  URL `announcement-sheet(s)` restent tels quels) :
  - `Sidebar.tsx`, `MobileNavSheet.tsx` (2 occurrences chacun)
  - `events/announcement-sheets/page.tsx` (h1)
  - `AnnouncementSheetManager.tsx` (titre, confirmations)
  - `announcement-sheet.service.ts` (titre et corps des notifications)
  - routes `announcement-sheet` (messages `ApiError`), et les tests qui les vérifient
- **Menu STAR** (`showStarEvents`) : les deux liens autonomes deviennent un `AccordionSection`
  « Événements » (clé `evenements`) avec deux `NavLink` : « Mes événements » (`/planning/events`)
  et « Trame des annonces » (`/events/announcement-sheets`). Même chose en `RootRow`/`SubRow` dans
  `MobileNavSheet.tsx`. `isEvenementsActive` inclut `/planning/events` pour que l'accordéon
  s'ouvre sur la bonne section. `BottomNav` n'est pas touché (son onglet Événements pointe déjà
  vers `/planning/events` pour le STAR).

### Volet 2 — Bandeau de préparation (star-view)

Nouveau composant client `star-view/PreparationBanner.tsx`, inséré dans `StarViewClient.tsx`
**après le lien audio et avant la zone imprimable** (`printRef`) ; les deux gestionnaires
actuellement en bas de page sont retirés de leur emplacement.

- Rendu : `<details>` natif, replié par défaut, `print:hidden`, carte `bg-white rounded-lg shadow
  mb-6` — le `mb-6` est le seul espacement entre bandeau et planning, identique à celui déjà
  utilisé entre le lien audio et le planning.
- `<summary>` (une ligne, cible tactile ≥ 44 px) : « Préparation du culte » + état de la trame
  (`Badge` « Trame déposée » / « Trame non déposée »), sans aucun nom d'ouverture/fermeture.
- Contenu déplié : `OpeningClosingManager` (si `canManage`) puis `AnnouncementSheetManager` (si
  `canDeposit || canRead`), séparés par `divide-y`. Les deux reçoivent une prop `embedded` qui
  retire leur propre carte (`bg-white shadow mb-6`) pour éviter la carte dans la carte.
- Bandeau non rendu si aucune des deux parties ne concerne l'utilisateur.
- Ordre retenu (question ouverte de la spec) : **Ouverture/Fermeture puis Trame**, l'ordre actuel,
  pour ne pas redéplacer ce que les testeurs connaissent déjà.
- L'en-tête imprimable (noms ouverture/fermeture) et l'export PNG/PDF ne changent pas.

### Volet 3 — « Mes demandes »

- **Formulaire unifié** (`requests/new/page.tsx` + `RequestForm.tsx`) : l'étape 1 gagne une
  rubrique « Autres demandes » avec deux tuiles qui **redirigent** vers les formulaires
  existants :
  - « Rendez-vous pastoral » → `/agenda/request?from=requests`, si `registry.has("agenda")`
  - « Demande comptable » → `/accounting/requests/new?from=requests`, si
    `registry.has("accounting") && (accounting:submit || profil pastoral)` — la même règle que la
    page de soumission comptable
- **Retour vers « Mes demandes »** : sur ces deux pages, `from=requests` (seule valeur acceptée,
  liste blanche — pas de redirection ouverte) change le lien retour et la destination après
  soumission en `/requests`.
- **Suivi** (`requests/page.tsx`) : section « Demandes comptables » sous la liste existante, avec
  les demandes financières de l'utilisateur (`submittedById = user`, église courante) : libellé,
  montant, statut, lien vers `/accounting/requests/[id]`. Pas de fusion dans `RequestsList` (les
  modèles et statuts diffèrent). Section absente si le module est désactivé ou si l'utilisateur
  n'en a aucune.
- **Menu** (`layout.tsx`) : le lien « Demande RDV pastoral » disparaît pour qui a « Mes demandes »
  (`members:view`). Il **reste** pour qui a `planning:view` sans `members:view`, c'est-à-dire le
  STAR — sinon il perdrait l'accès au RDV pastoral (voir risques ; spec ajustée).

### Volet 4 — « Communication & Production »

- **Barre d'onglets** : `AudioTabs` devient un composant générique `src/components/SpaceTabs.tsx`
  (props `tabs`, `ariaLabel`), avec `overflow-x-auto` pour tenir 5 onglets sur ~400 px.
  `audio/layout.tsx` l'utilise à la place de `AudioTabs` (supprimé) — rendu Audio identique.
- **Layouts** : `media/layout.tsx` et `communication/layout.tsx` (nouveaux) appellent
  `resolveMediaSpaceAccess` → `buildMediaSpaceTabs` et affichent `SpaceTabs` si plus d'un onglet
  (même règle qu'Audio). Chaque page garde son propre garde serveur.
- **Point d'entrée** `media/page.tsx` (nouveau) : redirige vers le premier onglet accessible,
  `notFound()` sinon — calqué sur `audio/page.tsx`. Déjà couvert par le préfixe `/media` du
  manifeste média (ADR-0012), aucune déclaration de route à ajouter.
- **Menu** (`layout.tsx`) : les liens Visuels / Communication / Événements / Projets / Collections
  sont remplacés par une entrée `{ href: "/media", label: "Communication & Production",
  matchPrefixes: ["/media", "/communication"] }`, présente si `buildMediaSpaceTabs(access)` n'est
  pas vide. `Audio` reste une entrée à part.
- **Lien actif** : les types de liens de `Sidebar`/`MobileNavSheet` acceptent un `matchPrefixes`
  optionnel ; `activeOperationsHref` s'appuie dessus (sinon `/communication/requests`
  n'allumerait pas un lien `/media`).
- **Titres de page** alignés sur les onglets : « Demandes visuels », « Demandes réseaux sociaux »,
  « Événements médias ».
- **Collections** : la page et la route POST passent sur `requireMediaCollectionAccess`.
- Le libellé de navigation du manifeste média (`Médias`) devient « Communication & Production »
  par cohérence.

### Documentation utilisateur

- `src/lib/tour-steps.ts` (étape `sidebar-service`) : texte réécrit selon la nouvelle composition
  d'Opérations.
- `src/components/GuideContent.tsx` : cartes « Visuels (Prod. Média) », « Communication »,
  « Demande de RDV pastoral » et note de bas de page mises à jour (libellés, points d'entrée).
- `CLAUDE.md` : ajouter l'espace « Communication & Production » à la description des espaces à
  onglets et le nouveau garde Collections.

## Décisions & alternatives écartées

- **Choix** : garder les URL et ajouter des layouts à onglets sur `/media` et `/communication` —
  *Pourquoi* : aucune redirection à maintenir, aucun lien de notification à réécrire, aucune
  déclaration de route à déplacer entre les manifestes planning et média.
- **Écarté** : regrouper tout sous un nouveau préfixe (`/communication-production/...`) —
  *Raison* : casse les liens existants, oblige à des redirections et à revoir les manifestes, pour
  un bénéfice purement cosmétique d'URL.
- **Choix** : tuiles qui redirigent vers les formulaires compta et RDV existants — *Pourquoi* :
  garantit par construction le « même traitement » exigé par la spec ; zéro duplication de deux
  formulaires riches (pièces jointes, séries, qualification).
- **Écarté** : intégrer ces formulaires dans `RequestForm.tsx` (41 Ko) — *Raison* : duplication de
  logique de validation et risque de divergence entre deux points d'entrée.
- **Choix** : nouveau garde dédié aux Collections — *Pourquoi* : seul moyen d'ouvrir les
  collections sans ouvrir la suppression/le partage des projets, événements et fichiers.
- **Écarté** : ajouter la Communication à `requireMediaManageAccess` — *Raison* : élargissement
  involontaire à 6 routes, contraire à la spec.
- **Choix** : `<details>` natif pour le bandeau — *Pourquoi* : replié par défaut, accessible au
  clavier et au lecteur d'écran, aucun état React à gérer.
- **Choix** : extraire `AudioTabs` en `SpaceTabs` générique — *Pourquoi* : deux espaces à onglets
  identiques ; deux copies du même composant divergeraient (le correctif `overflow-x-auto` en est
  déjà un exemple).
- **Pas d'ADR** : on réplique un pattern existant (spec 021) sans décision structurante nouvelle.

## Risques & points d'attention

- **STAR et RDV pastoral** : « Mes demandes » exige `members:view`, que le STAR n'a pas, alors que
  le RDV pastoral est ouvert à `planning:view`. Retirer le lien pour tous priverait le STAR du RDV
  pastoral. Le lien est donc gardé pour lui seul. Ouvrir « Mes demandes » au STAR (annonces,
  visuels) serait un changement de droits, hors périmètre. → spec ajustée.
- **Profil pastoral et compta** : la spec citait le profil pastoral parmi ceux qui ne peuvent pas
  soumettre de demande comptable ; c'est faux (`isPastoral` suffit aujourd'hui). → spec ajustée.
- **Élargissement Collections** : changement de sécurité ; un test vérifie en plus que
  `requireMediaManageAccess` refuse toujours un membre Communication.
- **Deux constructions de `MediaSpaceAccess`** (layout `(auth)` et `resolveMediaSpaceAccess`) :
  une divergence afficherait un lien de menu vers un espace vide. Couvert par des tests sur les
  deux, avec les mêmes profils.
- **Modules optionnels (spec 038)** : tuiles compta/RDV conditionnées à `registry.has(...)` ; sur
  une instance sans module média, `/media` est déjà en 404 via le proxy et le lien n'est pas
  construit.
- **Sticky des onglets** : `SpaceTabs` reprend le `sticky top-[68px] md:top-[80px]` d'Audio ; à
  vérifier à l'œil sur mobile pour les pages médias, qui ont leurs propres en-têtes.
- **Recette** : les 4 volets sont regroupés dans une PR, mais un commit par volet permet d'en
  retirer un si la recette le refuse.

## Stratégie de tests

- `src/lib/__tests__/media-space.test.ts` (nouveau) : `buildMediaSpaceTabs` — Production média
  seule (4 onglets, pas Réseaux sociaux), Communication seule (4 onglets, pas Visuels), les deux
  (5, sans doublon), Admin (5), Secrétaire (sans Collections), aucun droit (vide), ordre stable.
- `src/lib/__tests__/auth-media-collections.test.ts` (nouveau) : `requireMediaCollectionAccess`
  accepte `media:manage`, un membre Production média, un membre Communication ; refuse un STAR
  sans département de service. Même fichier : `requireMediaManageAccess` refuse toujours un
  membre Communication (non-régression).
- `api/admin/media/collections/__tests__/route.test.ts` : cas « membre Communication → 201 ».
- `(auth)/__tests__/star-navigation.test.ts` (étendu) : STAR garde « Demande RDV pastoral » ;
  Admin ne l'a plus et a « Mes demandes » ; membre Production média a une seule entrée
  « Communication & Production » et plus aucun lien Visuels/Projets/Collections ; utilisateur
  sans droit média n'a pas l'entrée ; Audio toujours présent.
- `api/events/__tests__/announcement-sheet.test.ts` : messages d'erreur mis à jour.
- Tests existants du service `announcement-sheet` (notifications) : libellés mis à jour.
- Hors Vitest (pas de tests de rendu de composants dans le repo) : bandeau star-view, menu STAR en
  accordéon, barre d'onglets sur mobile — vérification manuelle en recette, desktop et ~400 px,
  consignée dans `tasks.md`.
