# Tâches — Modules optionnels par déploiement

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. L'ordre suit les trois mouvements du plan —
> **déclarer → fermer → conditionner** — et non l'ordre canonique migration → services → API → UI :
> il n'y a ni migration, ni endpoint, et la seule UI est un relais de rendu. Les tâches `[P]` sont
> parallélisables. La colonne *CA* renvoie aux critères d'acceptation de `spec.md`.
>
> **Règle d'ordre non négociable** : T5 (test d'exhaustivité) passe au vert **avant** T6.
> Il transforme la table de déclaration en objet vérifié plutôt qu'en promesse ; écrire le proxy
> avant lui reviendrait à filtrer sur une table dont personne n'a prouvé qu'elle est complète.

## Prérequis

- [ ] Branche `feat/modules-optionnels-deploiement` (existante — spec et plan y sont déjà)
- [ ] **Aucune migration Prisma** : la feature ne touche pas le schéma (`plan.md` § Modèle de données)

## Tâches

### 1. Déclarer — la surface HTTP devient une donnée du manifeste

- [ ] **T1** — Créer l'algorithme de résolution de route : table de préfixes construite depuis une
      liste de manifestes + une liste noyau, résolution au **préfixe le plus long**, retour
      `{ owner, kind: "module" | "noyau" | "orphan" }`. Fonction pure : aucun import de module,
      de Next ou de Prisma (règle `core-no-modules-import`). Normalise barre finale et chaîne de
      requête. *(fichier : `src/core/module-routes.ts`)*

- [ ] **T2** [P] — Extraire le tableau des 11 manifestes dans un fichier dédié, importés depuis
      `@/modules/X/manifest` (ADR-0011), et faire consommer ce tableau par `src/lib/registry.ts`
      à la place de ses imports d'index actuels. `planningBus` reste importé depuis
      `@/modules/planning` (racine de composition).
      *(fichiers : `src/lib/manifests.ts`, `src/lib/registry.ts`)*

- [ ] **T3** — Remplir le champ `routes` (`authenticated` / `public` / `api`) des **11 manifestes**
      selon la table de répartition de `plan.md` § Granularité de déclaration. `storage` déclare
      un `routes` vide et commenté (infrastructure pure, sans surface HTTP). Les préfixes publics
      (`/api/audio/public`, `/api/media/gallery|validate|download|collection`,
      `/api/agenda/requests/public`, `/api/integration/requests`, `/api/integration/families/suggest`,
      `/ecouter`, `/rejoindre`, `/agenda-public`, `/media`) vont dans `routes.public` — ce sont eux
      qui remplaceront la liste blanche codée en dur du proxy.
      *(fichiers : `src/modules/*/manifest.ts` — 11 fichiers)*

- [ ] **T4** — Créer la racine de composition légère : `NOYAU_ROUTES` (`/`, `/no-access`,
      `/module-absent`, `/api/auth`, `/api/health`, `/api/cron`, `/api/current-church`,
      `/api/user`), construction de la table à partir des manifestes filtrés par le registry, et
      export de `resolveRouteOwner(pathname)` / `isPathEnabled(pathname)` / `publicPrefixes()`.
      **N'importe pas `src/lib/registry.ts`** (qui tire Prisma, NextAuth et S3) — reboote une vue
      manifeste-seule via `boot()` sur `src/lib/manifests.ts`.
      *(fichier : `src/lib/module-routes.ts`)*

- [ ] **T5** — **Test d'exhaustivité** *(CA16)*. Parcourt le système de fichiers
      (`src/app/**/route.ts` et `src/app/**/page.tsx`), convertit chaque fichier en chemin d'URL
      (segments dynamiques `[id]` normalisés, groupes de routes `(auth)` neutralisés, dossiers
      `__tests__` exclus), et vérifie que **chacun des 170 `route.ts` et de toutes les pages** est
      revendiqué par exactement un module ou par le noyau. Vérification symétrique : aucun préfixe
      déclaré ne pointe dans le vide. Même motif que `PERMISSION_OWNER` dans
      `src/modules/__tests__/manifests.test.ts`. **Doit être vert avant T6.**
      *(fichier : `src/lib/__tests__/routes-exhaustivite.test.ts`)*

- [ ] **T6** [P] — Test de résolution : préfixe le plus long (`/api/admin/media` → `media` et non
      `core`), chemin exact vs préfixe, chemin orphelin → `orphan`, insensibilité à la barre
      finale et à la chaîne de requête, préfixe d'un module inactif → non résolu.
      *(fichier : `src/core/__tests__/module-routes.test.ts`)*

### 2. Fermer — le proxy devient le point de contrôle unique

- [ ] **T7** [P] — Page 404 globale de l'application, aux couleurs ICC, sans composant nouveau
      (réutilise le style de `src/app/no-access/`). Elle sert aussi bien les 404 ordinaires que
      celles produites par cette feature — rien ne les distingue, c'est voulu.
      *(fichier : `src/app/not-found.tsx`)*

- [ ] **T8** [P] — Relais de rendu : page appelant `notFound()`, cible de la réécriture interne du
      proxy pour obtenir un vrai statut 404 avec l'habillage de l'application, sans changer l'URL
      affichée. **Vérifier à l'exécution que le statut HTTP est bien 404** ; si la réécriture ne le
      produit pas, replier sur une réponse 404 construite dans le proxy (le statut prime sur
      l'habillage — `plan.md` § Décisions). *(fichier : `src/app/module-absent/page.tsx`)*

- [ ] **T9** — Contrôle de module dans le proxy, **en tout premier**, avant la lecture du cookie de
      session *(CA1, CA2, CA3, CA4, CA5)*. API d'un module inactif → `404 { "error": "Not found" }` ;
      page d'un module inactif → réécriture vers `/module-absent` ; route publique par jeton d'un
      module inactif → 404 **avant** toute vérification de jeton. Placer le contrôle avant la
      session est ce qui ferme d'un seul geste le contournement Super Admin, les replis sur
      l'appartenance (`isCaptureTeamMember`, `isIntegrationMember`) et les modules sans permission.
      **Aucune garde de `src/lib/auth.ts` ni de `src/modules/*/auth.ts` n'est modifiée.**
      *(fichier : `src/proxy.ts`)*

- [ ] **T10** — Remplacer la liste blanche des routes publiques codée en dur dans le proxy par la
      dérivation de `routes.public` des manifestes actifs. La question « cette adresse est-elle
      ouverte sans session ? » redevient locale au module qui la porte, et tombe sous le contrôle
      de T5. *(fichier : `src/proxy.ts`)*

- [ ] **T11** — Élargir `config.matcher` à toute l'application, en excluant `_next/static`,
      `_next/image`, `favicon.ico` et les fichiers à extension. **Seule modification sensible aux
      performances du lot** : sans elle, `/audio`, `/agenda`, `/accounting`, `/rooms`, `/jobs`,
      `/media`, `/integration`, `/ecouter`, `/rejoindre` ne traversent pas le proxy et restent
      joignables. *(fichier : `src/proxy.ts`)*

- [ ] **T12** — Ajouter une règle `dependency-cruiser` `proxy-only-module-routes` interdisant à
      `src/proxy.ts` d'importer `^src/(lib/registry|modules)` — garantit que le proxy ne tire ni
      Prisma, ni NextAuth, ni S3. *(fichier : `.dependency-cruiser.cjs`)*

### 3. Conditionner — ce qui ne passe pas par une requête

- [ ] **T13** — Trois validations *fail-fast* dans `boot()` *(CA6, CA7, CA8, CA9)* : le module
      racine `core` doit être présent (sinon throw nommant la règle) ; un nom présent dans
      `ENABLED_MODULES` mais inconnu du tableau des manifestes fait échouer le démarrage (aujourd'hui
      `ENABLED_MODULES=audeo` désactive l'audio en silence — ajout **non demandé par la spec**,
      signalé comme tel dans `plan.md`) ; la validation de dépendances existante est conservée
      telle quelle, elle nomme déjà la dépendance manquante. Ajouter un journal d'une ligne au
      démarrage listant les modules actifs (réponse à la question ouverte 1 de la spec).
      *(fichier : `src/core/boot.ts`)*

- [ ] **T14** — Séparer les deux abonnements du bus selon la règle **nettoyer oui, créer non**
      *(CA12, CA13)* : `planning:event:cancelled` → `deleteMany(discipleshipAttendance)` reste
      **inconditionnel** (les lignes existent en base indépendamment de l'affichage ; le
      conditionner ferait échouer la suppression d'un événement sur une contrainte FK — unique
      exception nommée par la spec) ; `planning:request:status_changed` → `mediaProject.create`
      devient conditionné par `registry.has("media")`. **Commenter l'asymétrie dans le code**,
      sinon elle passera pour une incohérence à la première relecture.
      *(fichier : `src/lib/registry.ts`)*

- [ ] **T15** — Conditionner les travaux planifiés *(CA11)* : les imports statiques de
      `@/modules/integration` et `@/modules/jobs` deviennent dynamiques et gardés par
      `registry.has("integration")` / `registry.has("jobs")`. `/api/cron` **reste une route du
      noyau** : elle répond toujours, elle n'exécute que les travaux des modules actifs.
      *(fichier : `src/app/api/cron/route.ts`)*

### 4. UI — parcours sur instance réduite

- [ ] **T16** — Corriger la redirection d'atterrissage du layout authentifié, aujourd'hui codée en
      dur sur `/dashboard` (ligne 67) qui appartient au module `planning` : sur une instance sans
      planning elle mène à un 404. Viser la **première entrée de navigation disponible** pour
      l'utilisateur — la navigation est déjà construite depuis les manifestes actifs croisés aux
      permissions, l'information est disponible sur place.
      *(fichier : `src/app/(auth)/layout.tsx`)*

- [ ] **T17** — Élargir la garde `/no-access` (ligne 47) *(CA10)* : elle ne se déclenche
      aujourd'hui que si `churchRoles.length === 0`, or un Comptable sur une instance sans
      comptabilité conserve son rôle et n'est donc pas redirigé. La condition devient « aucune
      entrée de navigation disponible ». Réutilise le parcours existant — **aucun écran ni message
      spécifique à la désactivation** n'est ajouté. *(fichier : `src/app/(auth)/layout.tsx`)*

### 5. Tests

- [ ] **T18** — Tests de démarrage *(CA6, CA7, CA8, CA9)* : sans liste → 11 modules actifs ; liste
      sans `core` → throw nommant la règle ; module inconnu → throw nommant le nom fautif ;
      dépendance manquante → throw nommant la dépendance (`media` sans `storage`) ; `core` seul →
      succès, produisant une instance réduite à l'administration.
      *(fichier : `src/core/__tests__/boot.test.ts`)*

- [ ] **T19** — Étendre les tests du proxy *(CA1, CA2, CA3, CA4, CA5)* : module inactif → page
      réécrite, API 404, route publique par jeton 404 **sans consultation du jeton** ; module actif
      → **tous les cas existants préservés à l'identique** (non-régression, c'est le vrai enjeu du
      fichier) ; routes du noyau toujours servies quelle que soit la liste ; le matcher élargi ne
      capture pas `_next/static`. *(fichier : `src/__tests__/proxy.test.ts` — existant)*

- [ ] **T20** [P] — Tests des abonnements du bus *(CA12, CA13)* : `planning:event:cancelled`
      supprime les présences **même sans le module discipleship** ; `planning:request:status_changed`
      ne crée **pas** de `MediaProject` sans le module media, et en crée un avec.
      *(fichier : `src/lib/__tests__/registry-subscriptions.test.ts`)*

- [ ] **T21** [P] — Tests du cron *(CA11)* : sans `integration` ni `jobs`, la route répond 200 et
      n'appelle aucun de leurs services ; avec, le comportement actuel est préservé.
      *(fichier : `src/app/api/cron/__tests__/cron-modules.test.ts`)*

- [ ] **T22** [P] — Tests du layout authentifié *(CA10)* : utilisateur dont les rôles ne portent que
      sur des modules désactivés → redirection `/no-access` ; atterrissage sur la première entrée
      de navigation disponible et non `/dashboard` en dur.
      *(fichier : `src/app/(auth)/__tests__/` — existant)*

- [ ] **T23** [P] — Tests de non-régression de la matrice et de la navigation *(CA14, CA17)* :
      les permissions d'un module désactivé n'apparaissent dans les droits d'aucun rôle
      (`buildRolePermissions` sur un registry partiel), et la navigation ne propose aucune entrée
      d'un module désactivé. Comportement déjà acquis — le test le **fige**.
      *(fichiers : `src/core/__tests__/permissions.test.ts`, `src/modules/__tests__/manifests.test.ts`)*

### 6. Traçabilité & exploitation

- [ ] **T24** — **ADR-0012** — « Le manifeste déclare la surface HTTP du module ; le proxy
      l'applique ». Critère de `docs/adr/README.md` rempli : la décision reste vraie si cette
      feature était réécrite, elle touche les 11 modules, et elle installe une obligation durable
      (tout nouveau `route.ts` doit être revendiqué). Référence et prolonge ADR-0011. Indexer dans
      `docs/adr/README.md`. **Exigé par la constitution § VI** — la case ADR de la checklist de
      `plan.md` reste décochée tant que cette tâche n'est pas faite.
      *(fichiers : `docs/adr/0012-*.md`, `docs/adr/README.md`)*

- [ ] **T25** [P] — Documentation d'exploitation (question ouverte 2 de la spec, tranchée **dans**
      le périmètre : l'absence de doc est une cause identifiée du défaut). Documenter
      `ENABLED_MODULES` — syntaxe, module racine obligatoire, dépendances, échec au démarrage — et
      **écrire noir sur blanc** que le Super Admin perd l'accès applicatif aux données d'un module
      désactivé, la voie de retour étant de réactiver et redémarrer. C'est le point le plus
      susceptible de surprendre en exploitation.
      *(fichiers : `.env.example`, `docs/production.md`, `docs/architecture.md`, `docs/dev-onboarding.md`)*

- [ ] **T26** [P] — Mettre à jour `CLAUDE.md` : le champ `routes` du manifeste est désormais
      obligatoire pour toute nouvelle route (règle pour les agents), et `docs/roadmap-modularite.md`
      dont le chantier 6 pointe vers cette spec.
      *(fichiers : `CLAUDE.md`, `docs/roadmap-modularite.md`)*

- [ ] **T27** — Vérification manuelle sur une instance réduite : démarrer avec
      `ENABLED_MODULES=core,planning`, contrôler qu'une adresse audio répond 404 en Super Admin,
      qu'un lien de partage audio valide ne donne plus accès, puis redémarrer sans la variable et
      contrôler que **les mêmes données sont restituées inchangées** *(CA15 — le seul critère qui
      ne se vérifie pas en test unitaire, puisqu'il porte sur la persistance entre deux démarrages)*.

## Couverture des critères d'acceptation

| CA | Critère | Tâches |
|---|---|---|
| 1 | Toute adresse d'un module désactivé → introuvable | T3, T9, T19 |
| 2 | Le refus s'applique au Super Admin | T9, T19, T27 |
| 3 | Le refus s'applique à l'accès par appartenance à un département | T9, T19 |
| 4 | Le refus s'applique à un module sans permission (`integration`) | T3, T9, T19 |
| 5 | Un lien de partage public d'un module désactivé ne donne plus accès | T10, T19, T27 |
| 6 | Démarrage échoue en nommant la dépendance manquante | T13, T18 |
| 7 | Démarrage réussit et active tout si aucune liste | T13, T18 |
| 8 | Démarrage échoue si la liste désactive le module racine | T13, T18 |
| 9 | Démarrage réussit avec le seul module racine | T13, T18 |
| 10 | Rôles portant uniquement sur des modules désactivés → parcours « aucun accès » | T17, T22 |
| 11 | Aucun traitement planifié d'un module désactivé | T15, T21 |
| 12 | Suppression du noyau réussit malgré les lignes d'un module désactivé | T14, T20 |
| 13 | Un traitement ne crée pas de donnée d'un module désactivé | T14, T20 |
| 14 | Navigation sans entrée d'un module désactivé (non-régression) | T23 |
| 15 | Réactiver restitue l'accès aux données inchangées | T27 |
| 16 | Vérification automatique des adresses orphelines | T5 |
| 17 | Permissions d'un module désactivé absentes de tous les rôles | T23 |

**Aucun critère non couvert.** CA15 est le seul dont la vérification est manuelle (T27) : il porte
sur la persistance entre deux démarrages du process, ce qu'un test Vitest ne reproduit pas.

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries` — dont la nouvelle règle `proxy-only-module-routes` (T12)
- [ ] `npm run test`
- [ ] `npm run build` — le proxy est chargé au build, une erreur de composition s'y verrait
- [ ] T27 exécutée (CA15, vérification manuelle)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (voir table ci-dessus)
- [ ] Case ADR de la checklist de `plan.md` cochée (T24 faite)
- [ ] `CHANGELOG.md` — entrée à écrire au moment de la release, pas ici (convention du dépôt)
- [ ] PR `feat/modules-optionnels-deploiement` → `main`, CI verte **avant** merge
