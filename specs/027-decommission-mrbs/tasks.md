# Tâches — Fin de l'intégration externe MRBS (SSO et liaison de comptes)

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `fix/decommission-mrbs`
- [x] Migration Prisma générée (suppression du modèle `MrbsUserLink`)

## Tâches

### 1. Données & migration

- [x] **T1** — Retirer `model MrbsUserLink` et ses relations (`mrbsUserLinks`,
      `mrbsUserLinksCreated` sur `User` ; `mrbsUserLinks` sur `Church`) de `schema.prisma`, puis
      générer et appliquer la migration (`npm run db:migrate`) — table `mrbs_user_links`
      supprimée avec ses clés étrangères.
      *(fichier : `prisma/schema.prisma` + nouvelle migration)*

### 2. Logique métier (services)

- [x] **T2** — Supprimer le répertoire `src/modules/mrbs/` en entier (`index.ts` : manifeste du
      module, permission `mrbs:manage`, `computeMrbsLevel`).
      *(fichier : `src/modules/mrbs/` — supprimé)*

- [x] **T3** — Retirer l'import et l'entrée `mrbsModule` du tableau `modules` du registre.
      *(fichier : `src/lib/registry.ts`)*

- [x] **T4** — Retirer le mécanisme de cookie de session partageable par domaine
      (`AUTH_COOKIE_DOMAIN`, `cookieDomain`, `cookieOptions`) ; `SESSION_COOKIE_NAME` devient une
      constante fixe `"authjs.session-token"` ; `NextAuth({...})` cesse d'étaler `cookieOptions`
      dans sa config.
      *(fichier : `src/lib/auth.ts`)*

- [x] **T5** [P] — Retirer la dépendance du cookie posé manuellement à `AUTH_COOKIE_DOMAIN`
      (`domain`, `secure`) ; `secure` suit désormais le même critère que le reste de
      l'application.
      *(fichier : `src/app/api/auth/dev-login/route.ts`)*

### 3. API (route handlers)

- [x] **T6** — Supprimer les trois endpoints SSO MRBS (`session`, `user`, `users`).
      *(fichier : `src/app/api/auth/mrbs/` — supprimé)*

- [x] **T7** [P] — Supprimer l'endpoint de liaison de comptes.
      *(fichier : `src/app/api/admin/mrbs-links/route.ts` — supprimé)*

- [x] **T8** [P] — Retirer le contournement d'authentification par session pour
      `/api/auth/mrbs/*` (les routes n'existent plus après T6, le contournement n'a plus de
      cible).
      *(fichier : `src/proxy.ts`)*

### 4. UI

- [x] **T9** [P] — Supprimer la page d'administration de liaison de comptes et son composant
      client.
      *(fichiers : `src/app/(auth)/admin/mrbs-links/page.tsx`,
      `src/app/(auth)/admin/mrbs-links/MrbsLinksManager.tsx` — supprimés)*

### 4bis. Découvert en implémentation

- [x] **T9b** — Le script ponctuel d'import des réservations MRBS
      (`prisma/scripts/import-mrbs-reservations.ts`, non couvert explicitement par le plan)
      dépend du modèle `MrbsUserLink` supprimé en T1 : il ne compile plus. Non wiré à aucune
      commande `npm` (outil déjà exécuté, invoqué directement via `tsx`), et sans plus aucune
      instance MRBS à interroger — supprimé plutôt que réparé.
      *(fichier : `prisma/scripts/import-mrbs-reservations.ts` — supprimé)*

### 5. Configuration & nettoyage

- [x] **T10** [P] — Retirer du fichier d'exemple les variables devenues sans objet :
      `AUTH_COOKIE_DOMAIN`, la section « Module MRBS », `MRBS_API_SECRET`, `MRBS_DB_URL`,
      `MRBS_URL`, `MRBS_CHURCH_ID`.
      *(fichier : `.env.example`)*

- [x] **T11** [P] — Retirer le mock du modèle supprimé.
      *(fichier : `src/__mocks__/prisma.ts`)*

### 6. Tests

- [x] **T12** — Aucun test existant ne référence `mrbs` (vérifié avant ce plan) : la garantie de
      non-régression est `npm run typecheck` (toute référence résiduelle à un import ou type
      supprimé échoue à la compilation) et la suite complète `npm run test`, en particulier
      `src/core/__tests__/permissions.test.ts` qui énumère tous les modules actifs du registre.
      Aucun nouveau fichier de test à créer — une suppression n'a pas de comportement positif à
      couvrir.
      *(vérification, pas de fichier modifié)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (919/919)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] Confirmer avant déploiement qu'aucune église active ne dépend encore du SSO MRBS externe
      (le porteur produit a confirmé le remplacement complet par le module `rooms` — à
      reconfirmer si un doute subsiste au moment du déploiement, plan § Risques)
- [ ] PR ouverte vers `main`

## Traçabilité — critères d'acceptation → tâches

| Critère d'acceptation (`spec.md`) | Tâches |
|---|---|
| Cookie de session non partageable, quelle que soit la configuration | T4, T5, T10 |
| Page d'administration de liaison MRBS ↔ Koinonia inaccessible | T9 |
| Aucun point d'entrée MRBS externe exposé | T6, T7, T8 |
| Réservation de salles native non affectée | T2, T3 (aucune dépendance croisée vérifiée au plan) |
| Aucune trace résiduelle en documentation/config | T10 |
