# Plan — Logo de l'église dans l'interface

- **Spec** : [spec.md](./spec.md)
- **Statut** : Validé

## Résumé technique

Deux images par église (fond clair, fond sombre) stockées **en base**, comme les variantes de
l'icône de l'application (spec 069) : quelques dizaines de Ko, lues à chaque rendu de la coquille
authentifiée seulement pour leur version. Le service vit dans le module `core` (paramètres de
l'église, `church:settings`). La coquille reçoit les versions et affiche le logo via une route
servie par Koinonia, avec un cache immuable par version.

## Données

Modèle `ChurchLogo` (table `church_logos`), migration `add_church_logo` :

| Champ | Type | Rôle |
|---|---|---|
| `churchId` | String | église, cascade à la suppression |
| `variant` | `VarChar(10)` | `light` ou `dark` ; clé `(churchId, variant)` |
| `data` | `MediumBlob` | PNG préparé |
| `version` | `VarChar(32)` | empreinte aléatoire, changée à chaque dépôt (`?v=`) |
| `updatedById` | String? | auteur, `SetNull` |
| `updatedAt` | DateTime | |

## Service — `src/modules/core/services/church-logo.ts`

- `normalizeChurchLogo(buffer)` : 2 Mo au plus, format **décodé** PNG/JPEG/WebP (SVG refusé),
  orientation appliquée, réduit à 600 × 200 au plus (`fit: inside`, sans agrandir), PNG sans
  métadonnées ; toute anomalie = `ApiError(400)` lisible.
- `setChurchLogo(churchId, variant, buffer, actor)` : upsert, nouvelle version ; audit
  `Church` / `UPDATE` avec `details.logo` (« déposé »/« remplacé », variante).
- `removeChurchLogo(churchId, variant, actor)` : suppression + audit « retiré » ; sans logo, rien.
- `getChurchLogo(churchId, variant)` : octets ou `null`.
- `churchLogoSources(churchId, logos)` (pur, `schemas.ts`) : `{ light, dark }` adresses
  versionnées ; `dark` retombe sur `light`.

## API — `/api/churches/[churchId]/logo` (couvert par le préfixe `/api/churches`)

- `GET ?variant=light|dark&v=` : `requireChurchAccess(churchId)` (membre de l'église ou Super
  Admin : pas de fuite vers une autre église), `Cache-Control: private, max-age=31536000,
  immutable`, `nosniff` ; 404 sans logo.
- `POST` multipart (`variant`, `file`) : `requireChurchPermission("church:settings")`, borne
  `Content-Length` (411/413) avant lecture, débit limité ; 201 `{ version }`.
- `DELETE ?variant=` : même droit ; `{ version: null }`.
- `contract.ts` + `npm run openapi`.

## Interface

- `(auth)/layout.tsx` : `churchDisplay` sélectionne aussi `logos { variant, version }` (même
  requête) et passe `churchLogo = churchLogoSources(...)` (ou `null`) à `AuthLayoutShell`.
- `src/components/ChurchMark.tsx` : plumes ICC sans logo ; sinon `<img>` fond clair
  (`dark:hidden`) et fond sombre (`hidden dark:block`) — la variante `dark:` suit déjà le thème
  effectif (`globals.css`). Utilisé par `Sidebar` (`Brand`) et `TopBar` (mobile), hauteur bornée,
  `object-contain`.
- `ChurchEditClient` : bloc « Logo de l'église » hors du formulaire, deux emplacements
  (`ChurchLogoSlot`) avec aperçu sur fond clair et sombre (`data-theme`), dépôt immédiat,
  « Retirer » avec `ConfirmModal`, `router.refresh()` pour rafraîchir la coquille.
- Page de connexion inchangée.

## Constitution

Migration Prisma, permission existante `church:settings`, `churchId` explicite, Zod sur les
paramètres, contrat d'API, aucune couleur en dur, audit. Pas de nouvelle permission ni d'ADR (même
schéma que la spec 069).

## Tests

- Service : formats refusés (SVG, GIF, illisible, > 2 Mo), réduction, audit dépôt/remplacement/
  retrait.
- Route : 401/403 hors église ou sans `church:settings`, 411/413, 201, GET 404/200 et en-têtes.
- `churchLogoSources` : repli du sombre sur le clair, `null` sans logo clair.
- `ChurchMark` : plumes sans logo, deux images avec les bonnes classes.
