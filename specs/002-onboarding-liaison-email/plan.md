# Plan technique — Refonte de l'onboarding : liaison compte ↔ STAR par email

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-07-04

> Ce plan traduit la spec en approche technique conforme à `../constitution.md`.
> Feature structurante (auth + modèle de données) → **livraison multi-PR recommandée**
> (branche de base `feat/onboarding-liaison-email`, sous-PRs par phase).

## Vérification de conformité (constitution)

- [x] **Frontières modules** : l'onboarding vit dans `src/lib` (auth) et `src/app/api` (routes membres/liaison), pas dans `src/modules` → pas de contrainte de frontière module. La logique métier nouvelle sera regroupée dans un helper dédié (`src/lib/onboarding.ts`) plutôt que dispersée dans les handlers.
- [x] **Sécurité** : le point sensible est l'**auto-liaison self-service**. Le serveur vérifie **toujours** `session.user.email === member.email` (normalisé), fiche **non liée** dans l'église visée, avant de créer le lien. Toute **attribution de rôle** reste protégée par les permissions admin existantes (aucune auto-attribution de rôle). Scoping multi-tenant `churchId` systématique.
- [x] **Permissions** : `requireAuth()` pour les parcours self-service (limités à l'email du demandeur) ; validation des demandes de rôle via les permissions admin actuelles.
- [x] **Validation Zod** sur toutes les nouvelles mutations.
- [x] **Migration Prisma** : une seule, **légère**, en P2 (index sur `Member.email`). Via `prisma migrate dev` — **jamais `db push`**. `Member.email` existe déjà → **pas de migration pour l'email**. **P1 est sans migration.** (La correction `displayName` par église est hors périmètre — voir spec.)
- [x] **Enums** : réutilisation de `Role` (`@/generated/prisma/client`).
- [x] **UI** : réutilisation de l'assistant existant (`NoAccessClient.tsx`) et des composants `src/components/ui/`.

## Approche générale

On s'appuie sur l'ancre déjà présente (`User.email @unique`) et sur la brique de liaison per-tenant déjà saine (`MemberUserLink @@unique([userId,churchId])` / `([memberId,churchId])`). Trois leviers :

1. **Capturer l'email à la création d'une fiche** (le champ existe, il n'est simplement pas saisi).
2. **Rapprocher par email** au début de l'onboarding, en **proposition à confirmer** (pas en silencieux comme `PastoralProfile`), et établir le lien STAR directement après confirmation — le serveur validant l'égalité des emails.
3. **Dissocier identité et autorisation** : le lien STAR peut être automatique (identité, email vérifié) ; tout **rôle** reste validé par un admin.

Le tout **prévient** les doublons en amont (recherche avant création) et en aval (garde-fou serveur), sans introduire d'entité `Person`.

## Phasage (multi-PR)

| Phase | Contenu | Risque |
|---|---|---|
| **P1** | Email de 1ʳᵉ classe à la création + garde-fou anti-doublon (serveur + UI) — **sans migration** | Faible (pas d'auth) |
| **P2** | Réconciliation par email (endpoint candidats, + index `Member.email`) + auto-liaison STAR sur confirmation | Moyen (sécurité liaison) |
| **P3** | Parcours self-service refondu : « nouveau STAR » recherche-d'abord + rôle sans STAR (email d'abord, validation admin) | Moyen (UX) |

> Le nom d'affichage par église (`displayName`) est **hors périmètre** de cette feature (dette
> connexe, traitée séparément) — voir `spec.md`.

## Modèle de données

**Migration Prisma légère (P2 uniquement)** — `Member.email` existe déjà :

```prisma
model Member {
  // email String?  // existe déjà — aucun changement de colonne
  // …
  @@index([email])       // NOUVEAU (P2) — accélère le rapprochement par email
}
```

- **P1 ne comporte aucune migration** : le garde-fou interroge `Member` par email/nom à l'échelle d'une église (pas de besoin d'index à ce stade).
- **Aucune** contrainte d'unicité ajoutée sur `Member` (email optionnel, homonymes légitimes) — la déduplication reste **applicative** (garde-fou), cohérente avec la spec.
- **`displayName`** : inchangé (hors périmètre) — la liaison conserve le comportement actuel.

## Services / logique métier

Nouveau helper `src/lib/onboarding.ts` (pur/testable) :

- `normalizeEmail(email): string` — casse/espaces, pour comparaison fiable.
- `findUnlinkedMembersByEmail(email): Promise<CandidateMember[]>` — fiches dont `email` == email, **non liées** (pas de `MemberUserLink` pour leur église), avec église + département principal.
- `findDuplicateCandidates(churchId, { email?, firstName, lastName }): Promise<Member[]>` — pour le garde-fou création (match email exact OU nom normalisé dans l'église).
- `assertSelfLinkAllowed(sessionEmail, member, churchId)` — garde-fou serveur : lève `ApiError(403)` si emails différents, fiche déjà liée, ou église incohérente.

## API

| Endpoint | Méthode | Auth | Changement |
|---|---|---|---|
| `/api/members` | POST | `members:manage` | **P1** : `email` dans le schéma Zod ; garde-fou `findDuplicateCandidates` → 409/alerte si doublon |
| `/api/onboarding/candidates` | GET | `requireAuth` | **P2** (nouveau) : fiches non liées correspondant à l'email de session, toutes églises |
| `/api/member-user-links/self` | POST | `requireAuth` | **P2** (nouveau) : établit le lien STAR après `assertSelfLinkAllowed` ; crée le `MemberUserLink` + rôle `STAR` ; **pas** de validation admin |
| `/api/members/search` | GET | `requireAuth` | **P3** : inchangé (recherche nom) — le parcours « nouveau STAR » l'appelle avant toute création |
| `/api/member-link-requests` | POST | `requireAuth` | **P3** : la réconciliation email précède ; demande de rôle sans STAR conservée (validation admin) |
| `/api/member-link-requests/[id]` | PATCH | admin | **P1/P3** : garde-fou `findDuplicateCandidates` avant création de fiche (comportement `displayName` inchangé) |
| `/api/member-user-links` (admin direct) | POST | admin | **P3** (option) : recherche du user aussi par email |

Détails sensibles :
- **`/api/member-user-links/self`** : cœur sécurité. Séquence — `requireAuth` → charger la fiche cible → `assertSelfLinkAllowed(session.user.email, member, churchId)` → transaction : `MemberUserLink.create` + `UserChurchRole` STAR si absent. Journaliser (`logAudit`).
- **Rôles** : aucune route self-service ne crée de `UserChurchRole` autre que `STAR`. Tout rôle élevé passe par `member-link-requests` (statut PENDING) et la validation admin existante.

## UI / composants

- **`NoAccessClient.tsx`** (assistant onboarding, réutilisé par `/profile`) :
  - **P2** : nouvelle 1ʳᵉ étape « réconciliation email » — appelle `/api/onboarding/candidates` ; si résultat(s), affiche « Cette fiche vous correspond-elle ? » (nom, église, département) → confirmation → `POST /api/member-user-links/self`.
  - **P3** : l'action « je suis un STAR » bascule en **mode recherche** (`/api/members/search`) ; le bouton « créer une nouvelle fiche » n'apparaît qu'après action explicite « aucune ne correspond ». Le choix « rôle sans STAR » n'est proposé qu'après la réconciliation email.
- **Formulaire de création de membre** (`admin/members`) : **P1** ajout du champ email + affichage de l'alerte doublon (fiches candidates proposées avant confirmation de création).

## Décisions & alternatives écartées

- **Choix** : email comme clé d'identité, pas d'entité `Person`. *Pourquoi* : migration légère, s'appuie sur `User.email @unique`. *Écarté* : `Person` transverse (refonte de toutes les FK Member, risque élevé — sur-ingénierie).
- **Choix** : réconciliation en **étape d'onboarding explicite** (proposition à confirmer). *Écarté* : auto-liaison **silencieuse** dans le callback `session` (comme `PastoralProfile`) — la spec veut une confirmation, et l'identité mérite un acte volontaire.
- **Choix** : garde-fou déduplication **applicatif** (pas de `@@unique` sur Member). *Pourquoi* : email optionnel + homonymes légitimes rendent une contrainte dure inadaptée.
- **Écarté (de cette feature)** : corriger le `displayName` global → par église. *Raison* : dette connexe mais **non causale** des doublons, et à fort risque de régression ; traitée dans une spec séparée.

## Risques & points d'attention

- **Sécurité auto-liaison** : `assertSelfLinkAllowed` doit être **infaillible** (égalité email normalisée, fiche non liée, église cohérente). L'email Google est vérifié et `allowDangerousEmailAccountLinking` est actif → ancre fiable.
- **Fiches sans email existantes** : la réconciliation ne les couvre pas (prévention **en avant** uniquement) ; elles restent rattachables par nom.
- **Proposition cross-église** : une fiche d'une autre église peut être proposée — c'est légitime (c'est l'email de la personne).

## Stratégie de tests

- **Unitaires** (`src/lib/onboarding.ts`) : `normalizeEmail`, `findUnlinkedMembersByEmail` (match/non-match, exclusion des liées), `findDuplicateCandidates` (email exact + nom normalisé), `assertSelfLinkAllowed` (rejet si emails différents / fiche déjà liée / mauvaise église).
- **Routes** : création membre avec email + déclenchement du garde-fou (409/alerte) ; `/api/member-user-links/self` (succès + tous les refus de sécurité) ; demande de rôle sans STAR → reste `PENDING` (pas d'auto-attribution).
