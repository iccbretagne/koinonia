# Tâches — Navigation par métier

- **Spec** : `./spec.md` · **Plan** : `./plan.md` · **ADR** : `docs/adr/0033-architecture-information-par-metier.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**, groupées par lot. Un lot = une sous-PR vers
> `feat/navigation-metier` ; la PR finale `feat/navigation-metier` → `main` suit le lot 5.
> Les tâches `[P]` sont parallélisables au sein de leur lot.
>
> Repères de délégation : **[M]** = mécanique (remplacements, déplacements, mises à jour de
> tests ou de contenus selon une table déjà fixée) → modèle économique (Sonnet/Haiku) ;
> **[J]** = jugement (sécurité, règles de comptage, résolution de routes, arbitrages) → Opus.

## Prérequis

- [ ] Branche `feat/navigation-metier` à jour de `main` ; chaque lot sur `feat/navigation-metier-lot-N`.
- [ ] ADR-0033 relue ; questions ouvertes du plan tranchées ou défauts acceptés par le propriétaire.
- [ ] **Aucune migration Prisma** : aucun changement de schéma dans cette feature.
- [ ] Référence « avant » des écrans par profil produite sur `main` (T1.1), avant tout changement de navigation.

---

## Lot 0 — Corrections et registre des adresses (aucune adresse ne change)

### Logique / infrastructure

- [ ] **T0.1** [J] — Résolution sur la table complète : propriétaire inactif ⇒ `orphan`, y compris
      sous un préfixe parent actif ; `isPublic` aligné ; `activeRouteTable`/`fullRouteTable`
      unifiées. *(fichiers : `src/core/module-routes.ts`, `src/lib/module-routes.ts`)*
      **Fait quand** : `/admin/messages` (messages coupé), `/accounting/navette` (shuttle coupé),
      `/accounting/tresorerie`, `/admin/assistant`, `/admin/mcp`, `/admin/site-domains` résolvent `orphan`.
- [ ] **T0.2** [J] — Tests de résolution : chaque module désactivable ⇒ ses préfixes `orphan` ;
      les écrans des modules actifs restent résolus ; proxy ⇒ `/module-absent` pour une page,
      404 JSON pour une API. *(fichiers : `src/core/__tests__/module-routes.test.ts`,
      `src/proxy-modules.test.ts`)*
- [ ] **T0.3** [J] — `primaryRole(churchRoles, churchId, isSuperAdmin)` à priorité fixe (rôle
      virtuel compté, sans rôle ⇒ `STAR`) + tests toutes paires de rôles dans les deux ordres.
      *(fichiers : `src/lib/roles.ts`, `src/lib/__tests__/roles.test.ts`)*
- [ ] **T0.4** [M] — Remplacer `churchRoles.find(…)?.role ?? "DEPARTMENT_HEAD"` par `primaryRole`.
      *(fichiers : `src/app/(auth)/layout.tsx`, `src/app/(auth)/guide/page.tsx`, `src/components/GuidedTour.tsx`)*
- [ ] **T0.5** [P] [M] — « Mes membres » de la barre du bas pastorale → `/pastoral/members`.
      *(fichier : `src/lib/navigation.ts`)* **Fait quand** : test `bottomDestinations` pastoral.
- [ ] **T0.6** [P] [J] — Liens pastoraux vers un refus : ligne non cliquable sans droit sur la
      cible ; `canSubmit` sans `isPastoral`. *(fichiers : `src/app/(auth)/pastoral/reports/page.tsx`,
      `pastoral/accounting/page.tsx`, `accounting/requests/page.tsx`)* + tests de rendu.
- [ ] **T0.7** [P] [M] — Supprimer le champ `navigation` (type et 9 manifestes).
      *(fichiers : `src/core/module-registry.ts`, `src/modules/{accounting,agenda,audio,care,core,discipleship,media,planning,rooms}/manifest.ts`)*
      **Fait quand** : `grep -rn "navigation:" src/modules/*/manifest.ts` vide ; typecheck vert.

### Registre des écrans

- [ ] **T0.8** [J] — Créer `src/lib/paths.ts` (`SCREENS` + constructeurs typés, segments encodés)
      et `paths.test.ts` (exhaustivité `page.tsx` ↔ `SCREENS`, constructeurs ⇒ motif).
- [ ] **T0.9** [J] — Admettre `src/lib/paths.ts` et `src/lib/legacy-paths.ts` dans la règle
      `proxy-only-module-routes`. *(fichier : `.dependency-cruiser.cjs`)* **Fait quand** :
      `npm run lint:boundaries` vert.
- [ ] **T0.10** [M] — Déplacer `requests/prefill.ts` vers `src/lib/request-prefill.ts` ; mettre à
      jour `api/mcp/_actions/draft.ts` et la page. **Fait quand** : plus aucun import `@/app/` hors `src/app`.
- [ ] **T0.11** [M] — Remplacer les littéraux d'écran par `paths.*`, un préfixe par commit
      (planning, events/admin, accounting, care/agenda, media/audio, ticketing/forms, campaigns,
      serving/integration, jobs/rooms, core/admin), y compris services de modules (liens de
      notification), `lib/email.ts`, `api/assistant`, `api/mcp`. Peut être scindée entre plusieurs
      agents [P] par préfixe.
- [ ] **T0.12** [J] — Cliquet `no-screen-literals.test.ts` (préfixes de `url-mapping.txt`, hors
      tests et `specs/`) ; liste résiduelle justifiée vide.

### Vérification du lot 0

- [ ] **T0.13** [M] — Instantané `layout-props.test.ts.snap` : seul le rôle de la barre du bas change ; relu.
- [ ] **T0.14** [J] — Recette Playwright du lot 0 (plan, 4 scénarios), résultats joints à la PR.
- [ ] **T0.15** — `typecheck`, `lint`, `lint:boundaries`, `test`, `build` verts ; PR vers `feat/navigation-metier`.

---

## Lot 1 — Espaces, libellés, parenté (adresses actuelles)

- [ ] **T1.1** [J] — Référence « avant » : script de test qui sérialise, par profil de l'audit
      (§2.1–2.3), l'ensemble des écrans atteignables (entrées de menu + liens de page de
      navigation), exécuté sur `main`. *(fichier : `src/lib/__tests__/fixtures/screens-before.json`)*
- [ ] **T1.2** [J] — Extraire `loadNavigationInput(session)` du layout, sans changer requêtes ni
      résultats. *(fichiers : `src/lib/navigation-input.ts`, `src/app/(auth)/layout.tsx`)*
      **Fait quand** : instantané `layout-props` identique.
- [ ] **T1.3** [J] — Métadonnées `space`/`parent`/`label` par écran dans `paths.ts`, parenté H3
      comprise (événement vu par un STAR, `/absences`, `/care/request`, Mes réservations / Mes
      réponses, `ma-fiche`, `/messages/[id]`, onglets Finances/Trésorerie).
- [ ] **T1.4** [J] — `navigation.ts` : onze espaces, blocs (Administration : *Église*, *Accès*,
      *Communication*, *Suivi* ; Événements : *Église*, *Inscriptions* ; Personnes : *Intégration*),
      Plateforme réservée au Super Admin, Finances, Pastoral, Ressources (Offres fusionnées).
- [ ] **T1.5** [M] — Libellés du tableau de la spec dans la navigation, `SUBPAGE_LABELS`,
      `ITEM_LABELS`, `STANDALONE_LABELS`, en-têtes `PageHeader` concernés.
- [ ] **T1.6** [J] — `parentLink`/`buildBreadcrumb` sur la chaîne de parents du registre ;
      `fallbackParent` ne renvoie plus l'Accueil par défaut.
- [ ] **T1.7** [P] [J] — Section « Demandes comptables » dans Mes demandes pour Ministre / Resp.
      département (lecture de leur portée actuelle + « Nouvelle demande comptable ») ; entrée de
      menu comptable retirée de Demandes. *(fichiers : `requests/page.tsx`, `navigation.ts`)*
- [ ] **T1.8** [P] [M] — Entrée « Mes inscriptions » (deux pages, `matchPrefixes`, barre d'onglets
      liens) et ses deux `count`. *(fichiers : `navigation-input.ts`, `billetterie/mes-reservations/page.tsx`, `formulaires/mes-reponses/page.tsx`)*
- [ ] **T1.9** [P] [M] — Supprimer `AccountingNav` et ses usages.
- [ ] **T1.10** [P] [M] — Ajuster les ancres `data-tour` dont la cible change. *(fichier : `src/lib/tour-steps.ts`)*

### Tests

- [ ] **T1.11** [J] — Invariance des droits : écrans atteignables par profil = référence T1.1
      (écart admis : « Mes inscriptions »). *(fichier : `src/lib/__tests__/navigation-invariance.test.ts`)*
- [ ] **T1.12** [M] — Réécrire `navigation.test.ts` en tableau rôle × espaces ; `star-navigation.test.ts`.
- [ ] **T1.13** [M] — `navigation-subpages.test.ts` : parent ≠ Accueil par défaut ; onglet ⇒ écran porteur.
- [ ] **T1.14** [J] — Unicité des libellés par profil (exception de la question ouverte 2 seule
      admise) ; Plateforme absente pour l'Admin ; Finances sans entrée dans Demandes/Administration ;
      Suivi pastoral absent de Personnes.
- [ ] **T1.15** [J] — Recette Playwright du lot 1 (5 scénarios) ; mesure du temps de rendu du layout avant/après.
- [ ] **T1.16** — Vérifications CI + `build` ; PR.

---

## Lot 2 — Barre du bas, « Plus », « À traiter », recherche

### Compteurs (modules)

- [ ] **T2.1** [P] [M] — `countRequestQueueTodo(churchId)` (planning), utilisé par
      `secretariat/requests/page.tsx`. **Fait quand** : test de parité écran/fonction.
- [ ] **T2.2** [P] [J] — `accountingQueueCounts(churchId)` (à valider, à payer) aligné sur les
      indicateurs de `accounting/requests/page.tsx`, qui l'appelle ; `accounting.toValidate` réaligné.
- [ ] **T2.3** [P] [M] — Exposer `countOpenJustifications` par l'index `accounting` si besoin.
- [ ] **T2.4** [P] [J] — `careQueueCounts(access, churchId)` (rendez-vous et suivis non confiés),
      appelé par `care/page.tsx`.
- [ ] **T2.5** [P] [J] — `countServingQueue(actor)` : bucket `todo` (PVS/Admin) ou affectations
      `PENDING` des départements dirigés ; `ApplicationsClient`/`page.tsx` lisent la même valeur.
- [ ] **T2.6** [P] [J] — `countPendingDeclarations(session, churchId)` (ticketing) : déclarations
      `PENDING` sur événements non archivés avec l'action `payments`, une requête groupée, retourne
      aussi les identifiants d'événements concernés ; `ticketing.paymentsToHandle` réutilise la sélection.
- [ ] **T2.7** [P] [J] — `listPendingWithdrawals(session, churchId)` (planning) : `PENDING`,
      événement à venir, périmètre `getUserDepartmentScope`, `planning:edit` ; `planning.toReplace`
      l'appelle ; aucune donnée nominative renvoyée à l'Accueil.
- [ ] **T2.8** [P] [J] — `countSubmittedContributions(session, churchId)` (campaigns) :
      `SUBMITTED`, campagnes non archivées gérées par la personne, aucune valeur lue.
- [ ] **T2.9** [J] — Tests par file : règles (statuts, périmètre vide, archivés), isolation
      multi-église, parité écran/Accueil.

### Écrans cibles (paramètres d'ouverture, liste fermée)

- [ ] **T2.10** [P] [M] — `?a-traiter=reglements` sur `/billetterie` ; `?a-valider=1` sur
      `/collectes` ; `?etat=soumis` sur `/collectes/[id]` (filtre de `TrackingTab`).
- [ ] **T2.11** [P] [M] — `?declarer=1` (`/disponibilites`), `?nouveau=1` (`/admin/events`),
      `?saisie=1` (`/accounting/tresorerie`) ouvrent le formulaire existant ; valeurs inconnues ignorées (tests).

### UI

- [ ] **T2.12** [J] — `bottomDestinations` : listes par rôle principal + repli, dédoublonnage,
      jamais de formulaire, activation par chaîne de parents. *(fichiers : `navigation.ts`, `BottomNav.tsx`)*
- [ ] **T2.13** [P] [M] — `MoreSheet` groupé par `sidebarBlocks`.
- [ ] **T2.14** [P] [J] — Actions de la palette (6, conditions du plan) et destinations du rôle sans saisie.
      *(fichiers : `navigation-input.ts`, `CommandPalette.tsx`)*
- [ ] **T2.15** [J] — `TodoBlock` (serveur, `Suspense`, `Skeleton`, `catch` par file, liens un/plusieurs) dans `accueil/page.tsx`.

### Tests et recette

- [ ] **T2.16** [M] — `bottom-nav.test.ts`, `more-sheet.test.ts`, `palette-actions.test.ts`, `TodoBlock.test.tsx`.
- [ ] **T2.17** [J] — Recette Playwright du lot 2 (9 scénarios) ; temps de rendu de l'Accueil mesuré (aucune file > 100 ms).
- [ ] **T2.18** — Vérifications CI + `build` ; PR.

---

## Lot 3 — Vue pastorale en filtre et trois exceptions de droits

### Sécurité / API

- [ ] **T3.1** [J] — `hasPastoralRead(session, churchId)` ; test figé de `PASTORAL_READ_PERMISSIONS`
      (inchangé). *(fichier : `src/lib/auth.ts`)*
- [ ] **T3.2** [J] — `GET /api/events/[eventId]/report` : lecture pastorale de l'église de
      l'événement ; `PUT` inchangé ; `contract.ts` ; tests 200 / autre église / `PUT` 403.
- [ ] **T3.3** [J] — `GET /api/accounting/requests/[id]` : lecture pastorale (périmètre église),
      sans email du demandeur ni coordonnée bancaire ; `PATCH`, pièces, export inchangés ; tests.
- [ ] **T3.4** [J] — `POST /api/care/requests` : `requireChurchAccess(data.churchId)` + débit ;
      `contract.ts` ; tests (Reporter 201, autre église 403, débit).
- [ ] **T3.5** [M] — `npm run openapi` ; commiter `docs/openapi.json`.

### Pages

- [ ] **T3.6** [J] — `/admin/reports` et `/admin/events/[id]/report` en lecture pastorale ;
      `EventReportClient` mode `readOnly` (aucun champ éditable, aucun bouton) ; tests deux modes.
- [ ] **T3.7** [J] — `/accounting/requests/[id]` : périmètre pastoral = église ; aucune action
      rendue ; pièces non téléchargeables (défaut Q4).
- [ ] **T3.8** [J] — `/requests` : garde `requireChurchAccess` ; sections (internes, rendez-vous,
      questionnaires, inscriptions, comptables, Navette) ; « Nouvelle demande » seulement avec
      `members:view` ; `/requests/new` et APIs inchangées.
- [ ] **T3.9** [J] — Layout : entrée universelle « Mes demandes » hors `hasAnyNavigation` ;
      `/no-access` conservé (test CA10 spec 038).
- [ ] **T3.10** [M] — `/care/request` : garde `requireChurchAccess`.
- [ ] **T3.11** [J] — Vue pastorale = filtre de `buildSpaces` (défaut Q3) ; `buildPastoralSpaces`
      supprimé ; doublons pastoraux retirés de la navigation mais servis.
- [ ] **T3.12** [M] — Tableau pastoral extrait en composant, rendu par `/accueil` en vue
      pastorale ; `landingHref` et `switchToPastoralMode` → `/accueil`.

### Tests et recette

- [ ] **T3.13** [J] — Tests d'écriture refusée pour un pasteur sans rôle, route par route
      (`PUT` compte rendu, `PATCH`/`POST` comptables, dépôt de pièce, export).
- [ ] **T3.14** [M] — Tests Mes demandes (6 profils), vue pastorale (« Mes membres » unique, pasteur STAR garde Planning/Audio).
- [ ] **T3.15** [J] — Recette Playwright du lot 3 (7 scénarios), dont tentative d'écriture par la console.
- [ ] **T3.16** — Vérifications CI + `build` ; PR.

---

## Lot 4 — Bascule des adresses

### Préparation

- [ ] **T4.1** [J] — Écrire `src/lib/legacy-paths.ts` : table complète depuis `url-mapping.txt`
      (paramètres nommés, `[A-Za-z0-9_-]{1,64}`, aucun joker), chaînes repliées (ex-`next.config.ts`),
      table de préfixes pour `screens`, table inverse.
- [ ] **T4.2** [J] — `legacy-paths.test.ts` : liste complète, aucune chaîne, aucune source
      publique / `SITE_HOST_PASSTHROUGH` / `/media/c|d|g|v`, formes hostiles (`//`, `\`, `%2F`, `%5C`, `..`) refusées, cibles = pages.

### Déplacements

- [ ] **T4.3** [M] — `git mv` des dossiers de `src/app/(auth)/` selon la carte, layouts compris ;
      un espace par commit ; registre `paths.ts` mis à jour. Parallélisable par espace [P].
- [ ] **T4.4** [J] — Garde explicite dans chaque page sortie de `/admin` (perte du layout admin) ;
      test qui l'exige.
- [ ] **T4.5** [M] — Pages noyau : redirecteurs `/finances`, `/personnes`, `/pastoral`,
      `/ressources`, `/plateforme` ; `/evenements/mes-inscriptions` (onglets, modules sous
      `registry.has`) ; `NOYAU_ROUTES`.
- [ ] **T4.6** [M] — `routes` des manifestes (préfixes d'espace) ; `redirect("/admin")` → `/plateforme` (9).
- [ ] **T4.7** [J] — Exhaustivité des routes et des écrans verte ; module coupé ⇒ 404 sous préfixe partagé.

### Proxy et service worker

- [ ] **T4.8** [J] — Redirections dans `src/proxy.ts` après `siteHostRoute`, fichiers statiques et
      `/site` ; `GET`/`HEAD` seulement ; cible `orphan` ⇒ 404 à l'ancienne adresse ; 307 vers
      `nextUrl.clone()` ; journal du motif seul. Retirer les redirections de `next.config.ts`.
- [ ] **T4.9** [J] — `proxy-legacy.test.ts` (307 + requête, `POST`, hôte de site, module coupé,
      inconnue, sans session) ; instantané `site-render.test.ts.snap` inchangé.
- [ ] **T4.10** [M] — `public/sw.js` : `koinonia-v7`, réponses `redirected` non mises en cache.

### Adresses mémorisées

- [ ] **T4.11** [J] — `scripts/092-rewrite-stored-paths.ts` : `--dry-run` (défaut), `--apply`,
      `--reverse` ; sauvegarde JSON avant écriture ; lots de 500 ; `AssistantEntry.href`/`screens`,
      `SystemMessage.linkUrl` (même origine seulement), `Notification.link` ; liste des `answer` qui citent un ancien chemin.
- [ ] **T4.12** [J] — `rewrite-stored-paths.test.ts` : aller, retour, idempotence, préfixes, autre origine intacte.
- [ ] **T4.13** [J] — Effacements par lien (ADR-0019) via `legacyAndCurrent(path)`.
      *(fichiers : `src/lib/notifications.ts`, `care/services/followups.ts`, `care/services/relances.ts`, `integration/services/family-service.ts`)*
- [ ] **T4.14** [M] — Runbook : étape manuelle du script (recette puis production), fenêtre hors
      événement de billetterie, consigne aux organisateurs. *(fichier : `docs/production.md`)*

### Contenus

- [ ] **T4.15** [P] [M] — Fiches de l'assistant (`href`, `hrefLabel`, fils en clair),
      `SCREEN_PERMISSION` ; `knowledge.test.ts` (chaque `href` résout, mêmes écrans d'aide qu'avant).
- [ ] **T4.16** [P] [M] — Guide (`GuideContent.tsx`) et visite guidée (`tour-steps.ts`) : espaces, libellés, adresses.
- [ ] **T4.17** [P] [M] — Documentation : `CLAUDE.md`, `docs/auth.md`, `architecture.md`,
      `database.md`, `design-system/guidelines/10-navigation.md`, `guide-screenshots.md`, chemins cités dans les ADR.
- [ ] **T4.18** [M] — Tests à littéraux (57 fichiers) et instantanés mis à jour ; test « adresse = préfixe de l'espace » (hors exceptions).

### Version de secours et recette

- [ ] **T4.19** [J] — Branche `rollback/092-lot4` (table inverse) construite et recettée.
- [ ] **T4.20** [J] — Recette Playwright du lot 4 (9 scénarios), dont toute la carte en 307, hôte
      de site, `/media/g/<jeton>`, écrans hors ligne en mode avion, aide contextuelle, ancien lien de notification.
- [ ] **T4.21** [J] — Script en recette : `--dry-run`, relecture, `--apply`, vérifications, `--reverse`, `--apply`.
- [ ] **T4.22** — Vérifications CI + `build` + `openapi` ; PR.

---

## Lot 5 — Redirections permanentes (après 2 à 4 semaines d'observation)

- [ ] **T5.1** [J] — Bilan de l'observation (journaux de redirection, 404, retours) consigné dans la PR.
- [ ] **T5.2** [M] — Table en 308 ; tests mis à jour. *(fichiers : `legacy-paths.ts`, tests)*
- [ ] **T5.3** [M] — Retirer `legacyAndCurrent` et la branche de secours.
- [ ] **T5.4** [M] — ADR-0033 : statut « Accepté », date du passage en 308.
- [ ] **T5.5** [J] — Recette Playwright du lot 5 (échantillon en 308, sites et liens publics intacts).
- [ ] **T5.6** — Vérifications CI ; PR ; puis PR finale `feat/navigation-metier` → `main`.

---

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Espaces exacts, aucun vide | T1.4, T1.12, T1.15 |
| Écrans identiques par profil hors 3 exceptions | T1.1, T1.11 |
| Mes demandes et rendez-vous pour tous, création inchangée | T3.4, T3.8–T3.10, T3.14 |
| Lecture pastorale seule, écritures refusées serveur | T3.1–T3.3, T3.6, T3.7, T3.13 |
| Plateforme Super Admin seul, Administration sans plateforme | T1.4, T1.14 |
| Finances regroupe ; ni Demandes ni Administration n'en contiennent | T1.4, T1.7, T1.14 |
| Ministre / RD sans Finances, comptables depuis Mes demandes | T1.7, T1.14 |
| Suivi pastoral et agenda dans Pastoral | T1.4, T1.14 |
| Libellés uniques | T1.5, T1.14 |
| Barre du bas indépendante de l'ordre des rôles | T0.3, T2.12, T2.16 |
| Barre du bas conforme, sans doublon ni formulaire | T2.12, T2.16 |
| Bouton de l'espace ou du parent allumé | T2.12, T2.16 |
| « Plus » = groupes de la barre latérale | T2.13 |
| STAR : Mes demandes en 4e destination et contenu | T2.12, T3.8, T3.15 |
| Parent ≠ Accueil par défaut ; chevron et fil d'Ariane ; onglets | T1.3, T1.6, T1.13 |
| « À traiter » : huit files, mêmes nombres | T2.1–T2.9, T2.15 |
| Recherche : actions autorisées seulement | T2.14, T2.16 |
| « Mes membres » unique ; pasteur STAR garde Planning/Audio | T0.5, T3.11, T3.14 |
| Adresse = préfixe de l'espace | T4.3, T4.18 |
| Anciennes adresses redirigées, temporaire puis permanent, liste complète testée | T4.1, T4.2, T4.8, T4.9, T5.2 |
| Sites et liens publics jamais redirigés | T4.2, T4.9, T4.20 |
| Module désactivé : 404 ancienne et nouvelle adresse | T0.1, T0.2, T4.7, T4.9 |
| Adresses mémorisées réécrites ; aide contextuelle identique | T4.11, T4.12, T4.15, T4.21 |
| Écrans hors ligne après bascule | T4.10, T4.20 |
| Ancien lien de notification | T4.8, T4.11, T4.13, T4.20 |
| Adresses publiques et jetons inchangés | T4.2, T4.20 |
| Aucune boucle ; ancienne adresse inexistante ⇒ 404 | T4.2, T4.9 |
| Guide, visite, fiches, design system à jour | T4.15–T4.17 |
| Déclarations de navigation mortes supprimées | T0.7 |

## Vérification finale (avant la PR finale vers `main`)

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run openapi` et `docs/openapi.json` commité
- [ ] `permissions.test.ts` et tableau des permissions de `CLAUDE.md` inchangés
- [ ] Instantané `site-render.test.ts.snap` inchangé depuis `main`
- [ ] Script de réécriture exécuté en recette et en production, sauvegardes archivées
- [ ] Tous les critères d'acceptation de `spec.md` cochés (table ci-dessus)
- [ ] ADR-0033 passée à « Accepté »
- [ ] PR ouverte vers `main`
