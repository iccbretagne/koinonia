# Plan technique — Fin de l'intégration externe MRBS (SSO et liaison de comptes)

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : suppression pure, aucun nouvel import inter-modules créé
- [x] **Sécurité** : le retrait élimine la surface (cookie partagé, endpoints à secret partagé) —
      aucune route restante à protéger
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — `mrbs:manage` disparaît avec le
      module qui la déclarait, sans intervention manuelle sur le registre
- [x] **Validation** Zod sur toutes les mutations — aucune mutation ajoutée
- [x] **Migration** Prisma prévue (suppression de modèle) — pas de `db push`
- [x] **Enums** importés depuis `@/generated/prisma/client` — sans objet
- [x] **UI** : aucun composant créé ; page et composant existants supprimés

## Approche générale

Décommissionnement complet, pas de remplacement : le module `mrbs` (SSO + liaison de comptes)
est supprimé dans son intégralité, ainsi que le mécanisme de cookie de session partageable par
domaine qui n'existait que pour lui. La réservation de salles elle-même (`src/modules/rooms`)
n'est pas touchée — elle ne dépend du module `mrbs` d'aucune façon (vérifié : aucun import croisé
entre les deux modules).

Le retrait suit exactement la trace des références au module, relevées avant ce plan :
- Module et ses trois endpoints SSO (`session`, `user`, `users`, tous authentifiés par secret
  partagé `MRBS_API_SECRET`, jamais par cookie).
- Page d'administration de liaison de comptes et son composant client, et leur route API.
- Mécanisme de cookie de session partagé (`AUTH_COOKIE_DOMAIN`) dans `src/lib/auth.ts` et
  `src/app/api/auth/dev-login/route.ts` — c'est la cause racine du finding H-04, retirée avec le
  seul usage qui la justifiait.
- Point de passage dans `src/proxy.ts` qui laissait les endpoints SSO échapper à
  l'authentification par session (cohérent : ils s'authentifient par secret, pas par cookie).
- Modèle Prisma `MrbsUserLink` et ses relations sur `User`/`Church`.
- Variables d'environnement d'exemple devenues sans objet.

## Modèle de données

```prisma
// Supprimé de schema.prisma :
model MrbsUserLink { … }               // table mrbs_user_links

// Sur User : retrait de
mrbsUserLinks        MrbsUserLink[] @relation("MrbsLinkedUser")
mrbsUserLinksCreated  MrbsUserLink[] @relation("MrbsLinkCreator")

// Sur Church : retrait de
mrbsUserLinks         MrbsUserLink[]
```

Migration Prisma (`npm run db:migrate`) supprimant la table `mrbs_user_links` et ses clés
étrangères. **Perte de données actée** : toute liaison de compte existante (le mapping compte
MRBS ↔ compte Koinonia) est perdue — sans conséquence fonctionnelle puisque l'intégration qui la
consommait disparaît dans le même changement. Signalé explicitement en tâche de vérification
avant déploiement (pas un effet de bord silencieux, conformément à la spec).

## API

| Endpoint | Changement |
|---|---|
| `GET /api/auth/mrbs/session` | **Supprimé** |
| `GET /api/auth/mrbs/user` | **Supprimé** |
| `GET /api/auth/mrbs/users` | **Supprimé** |
| `GET/POST/DELETE /api/admin/mrbs-links` | **Supprimé** |

Aucun endpoint restant ne référence `mrbs:manage` ni `MrbsUserLink` — la permission disparaît
avec le module qui la déclarait (`rolePermissions` est calculé depuis le registre de modules
actifs, `@/lib/registry`), sans liste à maintenir manuellement.

## Services / logique métier

- `src/modules/mrbs/` — **répertoire supprimé** en entier (`index.ts`, `computeMrbsLevel`).
- `src/lib/registry.ts` — retrait de l'import et de l'entrée `mrbsModule` du tableau `modules`.
- `src/lib/auth.ts` — retrait du bloc `AUTH_COOKIE_DOMAIN`/`cookieDomain`/`cookieOptions` ; le
  cookie de session NextAuth reprend son comportement par défaut (`authjs.session-token`,
  jamais de `domain` explicite — donc host-only par construction du navigateur). `NextAuth({...})`
  cesse d'étendre sa config avec `...cookieOptions`.
  `SESSION_COOKIE_NAME` devient une constante fixe `"authjs.session-token"`, toujours exportée
  (consommée par `dev-login`).
- `src/app/api/auth/dev-login/route.ts` — le cookie posé manuellement n'accepte plus de `domain`
  ni de `secure` conditionnés par `AUTH_COOKIE_DOMAIN` ; `secure` suit désormais le même critère
  que le reste de l'application (environnement de déploiement), pas une variable devenue sans
  objet.
- `src/proxy.ts` — retrait du bloc qui laissait passer `/api/auth/mrbs/*` sans cookie de session
  (les routes n'existent plus, le contournement n'a plus de cible).

## UI / composants

- `src/app/(auth)/admin/mrbs-links/page.tsx` — **supprimé**.
- `src/app/(auth)/admin/mrbs-links/MrbsLinksManager.tsx` — **supprimé**.
- Aucun lien de menu ne pointait vers cette page dans le code actuel (vérifié : aucune référence
  à `mrbs-links` ou `mrbsUrl` dans `Sidebar.tsx`/`AuthLayoutShell.tsx`/`BottomNav.tsx` — un ancien
  lien de navigation mentionné au CHANGELOG a déjà disparu d'une évolution antérieure). Rien à
  retirer côté navigation.

## Décisions & alternatives écartées

- **Choix : suppression complète plutôt que durcissement (`__Host-*`, OIDC, code à usage
  unique)** — *Pourquoi* : la correction proposée par l'audit visait à sécuriser une intégration
  qui doit continuer d'exister. Ce n'est plus le cas : MRBS est remplacé par le module natif
  `rooms`. Sécuriser un pont qu'on peut supprimer serait un travail au bénéfice de rien.
- **Écarté : adopter le préfixe `__Host-*` sur le cookie de session par la même occasion** —
  *Raison* : durcissement valable en soi, mais indépendant de ce fix — H-04 est fermé par la
  suppression du partage cross-domaine, qui est la seule chose qui rendait le cookie lisible
  hors de Koinonia. Ajouter un préfixe de cookie ici élargirait le périmètre au-delà du
  décommissionnement demandé ; à traiter, si souhaité, comme une amélioration séparée.
- **Écarté : conserver le module `mrbs` désactivé (`ENABLED_MODULES` sans "mrbs")** — *Raison* :
  le code resterait présent, testé nulle part, et la variable `AUTH_COOKIE_DOMAIN` resterait
  disponible en configuration — soit exactement le risque que cette spec ferme. Du code mort
  gardé "au cas où" est plus dangereux ici qu'ailleurs : c'est lui qui porte la vulnérabilité.
- **Écarté : conserver la table `mrbs_user_links` sans le code qui la lit** — *Raison* : donnée
  qui ne sert plus rien, et dont la présence pourrait laisser croire à une réactivation possible
  du module. La spec demande explicitement que la suppression de données soit un choix explicite
  et documenté plutôt qu'un oubli — c'est fait ici, en migration dédiée.

## Risques & points d'attention

- **Toute installation de production qui a réellement configuré `AUTH_COOKIE_DOMAIN`** perd le
  SSO MRBS dès le déploiement de cette spec — c'est l'objectif, mais à confirmer avant déploiement
  qu'aucune église ne dépend encore activement de ce SSO (le porteur produit a confirmé que MRBS
  est remplacé partout par `rooms`, à revérifier au moment du déploiement si un doute subsiste).
- **Perte des liaisons de comptes existantes** (`mrbs_user_links`) — actée, voir § Modèle de
  données ; sans conséquence fonctionnelle une fois le SSO retiré.
- **`.env.example`** : retirer les variables `AUTH_COOKIE_DOMAIN`, `MRBS_API_SECRET`,
  `MRBS_DB_URL`, `MRBS_URL`, `MRBS_CHURCH_ID` et leurs commentaires, pour qu'aucun nouveau
  déploiement ne les configure par réflexe.

## Stratégie de tests

Aucun test existant ne référence `mrbs` (vérifié : aucun fichier `*.test.ts` du dépôt ne
mentionne `mrbs`, `MrbsUserLink` ni `mrbsModule`) — rien à adapter côté tests métier.

- Retirer `mrbsUserLink: createModelMock()` de `src/__mocks__/prisma.ts` (modèle qui n'existe
  plus après migration).
- Après suppression, `npm run typecheck` est la garantie principale qu'aucune référence résiduelle
  ne subsiste (import mort, type `MrbsUserLink` utilisé quelque part) — le compilateur échoue sur
  toute référence oubliée.
- `npm run test` (suite complète) confirme qu'aucun test existant ne dépendait implicitement du
  module (ex. via le chargement complet du registre dans `src/core/__tests__/permissions.test.ts`,
  qui énumère tous les modules actifs).
