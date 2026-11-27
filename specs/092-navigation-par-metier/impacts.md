# Spec 092 — Navigation par métier : audit des impacts avant le plan

Audit en lecture seule de la branche `feat/navigation-metier` (commit 3a2c62e5). Les comptages viennent de grep et de scripts jetables rangés dans le scratchpad : `count.sh`, `lits.txt`, `pages.txt`, `map.sed`, `mapping.txt` et `probe.ts`. Les chemins `file:line` sont relatifs à la racine du dépôt. Je n'ai ouvert ni `docs/diagnostic-v2.md` ni `security/`.

## 0. Mesures de référence

| Mesure | Valeur |
|---|---|
| Pages `page.tsx` sous `(auth)` | 142 |
| Pages dont l'URL change dans la carte proposée (`mapping.txt`) | **122** (20 inchangées : `/accueil`, `/admin` (église), `/admin/access*`, `/admin/audit-logs`, `/admin/departments*`, `/admin/messages*`, `/admin/ministries`, `/admin/pastoral-profiles`, `/admin/users*`, `/guide`, `/mcp/autoriser`, `/planning`, `/planning/remplacements/[id]`, `/profile*`) |
| Littéraux de chemins `(auth)` dans `src` (hors `generated`) | 1 385, dont 425 dans les tests (57 fichiers) et 960 hors tests |
| …dont gabarits construits `` `/x/${…}` `` hors tests | 233 occurrences (56 formes distinctes) |
| `redirect("/…")` serveur, hors tests | 52 |
| `router.push/replace` | 35 |
| `href="/…"` littéraux (JSX) | 193 |
| `href: "/…"` (objets) | 276 |
| Fiches de l'assistant (`src/modules/assistant/knowledge`) | 211 littéraux dans 6 fichiers (105 `href:`, 105 `hrefLabel:`) |
| Docs, hors spec et hors diagnostic-v2 | CLAUDE.md 44, guide-screenshots.md 69 (79 captures), auth.md 19, roadmap 10, architecture 8, production 7, database 7, adr 6, design-system 5 |
| `specs/` | 755 occurrences dans 114 fichiers (historique : à ne pas réécrire) |
| `docs/openapi.json` | 0 chemin de page (ADR-0023 ne couvre que l'API) |

**Littéraux par préfixe** (occurrences/fichiers dans `src` | occurrences/fichiers dans les tests | occurrences dans les docs) :

| Préfixe | src | tests | docs |
|---|---|---|---|
| `/admin` | 157/61 | 80/13 | 69 |
| `/accounting` | 103/33 | 23/9 | 16 |
| `/dashboard` | 66/23 | 24/8 | 10 |
| `/media` | 60/23 | 33/10 | 30 |
| `/planning` | 57/18 | 36/16 | 21 |
| `/billetterie` | 48/22 | 14/6 | 10 |
| `/collectes` | 40/21 | 28/5 | 7 |
| `/jobs` | 40/27 | 17/6 | 5 |
| `/care` | 38/24 | 20/9 | 35 |
| `/disponibilites` | 35/12 | 6/4 | 3 |
| `/events` | 34/18 | 18/4 | 15 |
| `/integration` | 32/13 | 13/4 | 24 |
| `/requests` | 31/17 | 14/8 | 33 |
| `/candidatures` | 30/13 | — | — |
| `/audio` | 28/15 | 20/7 | 36 |
| `/agenda` | 23/12 | 16/4 | 7 |
| `/formulaires` | 21/10 | — | — |
| `/pastoral` | 18/7 | 14/2 | — |
| `/rooms` | 12/8 | — | — |
| `/communication` | 11/7 | — | — |
| `/dons` | 10/8 | 6/5 | 15 |
| `/absences` | 9/4 | — | — |
| `/secretariat` | 8/6 | — | — |

**Répartition par zone (hors tests)** :
- pages `(auth)` : 364 ;
- `lib/navigation.ts` : 86 ;
- manifestes : 65 ;
- services des modules : 91 ;
- `api/mcp` et `api/assistant` : 45 ;
- composants : 31 ;
- reste de `lib` : 28 ;
- autres routes API : 27 ;
- `GuideContent` : 5.

---

## 1. Impacts choix par choix

Coût : **S** pour moins d'un jour, **M** pour 1 à 3 jours, **L** pour plus de 3 jours.

### 1.1 Espaces (dont Finances, Pastoral, Plateforme, Événements)

**Ce qui est touché**
- `src/lib/navigation.ts` construit tout : 86 littéraux et les blocs de barre latérale `CONFIG_BLOCKS` (l.242).
- `space(...)` est appelé l.402-412 et `dataTour` y est posé ; la vue pastorale est construite l.260-272, l.767 et l.851-852.
- `src/app/(auth)/layout.tsx` calcule les liens : `requestLinks` l.208-215, liens agenda l.345-350.
- Les barres consommatrices : `Sidebar`, `BottomNav`, `MoreSheet`, `TopBar` (fil d'Ariane) et `CommandPalette`.
- Les cibles `data-tour` de `src/lib/tour-steps.ts` (144 lignes, rôles codés l.3-10) : `sidebar-members`, `sidebar-service`, `sidebar-ressources`, `sidebar-reports`, `sidebar-planning`, `sidebar-pastoral`, `sidebar-events`, `sidebar-config`.

**Finances**
- Regroupe `accounting` (`/accounting`), `shuttle` (`/accounting/navette`), `treasury` (`/accounting/tresorerie`) et `giving` (`/dons`).
- `/dons` et `/accounting` n'ont pas de layout commun ; il n'existe aucun layout sous `accounting`.
- La page d'accueil `/finances` n'appartient à aucun des quatre modules. Elle doit vivre dans `NOYAU_ROUTES` (`src/lib/module-routes.ts`) et lister ce qui est actif (`registry.has`).

**Plateforme**
- Sept écrans réservés au Super Admin, gardés page par page par `requireSuperAdmin` ou `isSuperAdmin` puis `redirect("/admin")`.
- Ces écrans relèvent de cinq propriétaires :
  - `core` : `/admin/churches`, `/admin/backups`, `/admin/api`, `/admin/app-icon` ;
  - `ticketing` : `/admin/site-domains` ;
  - `assistant` : `/admin/assistant` ;
  - `mcp` : `/admin/mcp`.
- `redirect("/admin")` apparaît 9 fois. Après la bascule, il doit pointer vers `/plateforme` ou `/accueil`, sinon un Super Admin sans église atterrit sur l'administration d'une église.

**Pastoral**
- Collision de préfixe : `/pastoral` est aujourd'hui l'accueil de la **vue pastorale**, possédé par `core`. Ses sous-pages `/pastoral/members|events|reports|accounting` sont gardées par `requirePastoralActiveChurch`.
- L'espace « Pastoral » de la spec réunit `agenda` (`/agenda`) et `care` (`/care`).
- Si l'espace prend `/pastoral/...`, la plus longue racine commune (ADR-0012, `matchesPrefix`, `src/core/module-routes.ts:117-124`) répartit bien les propriétaires (`/pastoral/agenda` à `agenda`, `/pastoral/suivi` à `care`, `/pastoral` à `core`). En revanche, `/pastoral` racine change de sens : accueil de vue d'un côté, accueil d'espace de l'autre.

**Événements**
- Réunit `planning` (`/events`, `/admin/events`, `/admin/reports`, `/admin/welcome-duty`), `ticketing` (`/billetterie`) et `forms` (`/formulaires`).
- `/planning/events` et `/events` désignent déjà le même libellé « Agenda de l'église » (`navigation.ts:301/304`) : deux URL pour une seule entrée.

**Risque.** Moyen. La structure est centralisée dans un seul fichier, mais la propriété des préfixes devient multi-modules sous un même préfixe d'espace (voir § 2.3, trou ADR-0012).

**Coût.** M pour la navigation seule, hors URL.

**Décisions pour le plan**
- La page d'accueil de chaque espace appartient-elle au noyau ?
- Quel préfixe pour Pastoral ?
- Faut-il fusionner `/planning/events` et `/events` ?

### 1.2 « Mes demandes » ouvert à tous

**Ce qui est touché**
- Garde de page `requireChurchPermission("members:view")` sur trois pages :
  - `src/app/(auth)/requests/page.tsx:20` ;
  - `/requests/new` l.20 ;
  - `/requests/[id]/edit` l.22.
- Garde d'API : `POST /api/requests` exige `members:view` (`src/app/api/requests/route.ts:137`) et `planning:edit` pour certains types (l.172).
- Sans `members:view`, le layout ajoute `requestLinks.push("/agenda/request")` (`layout.tsx:208-215`).

**Rendez-vous pastoral**
- `/care/request` (page l.38) et `POST /api/care/requests` (l.67) exigent `planning:view`.
- FD, Reporter, Comptable et RSP ne peuvent donc pas demander de rendez-vous aujourd'hui.
- Une rubrique « Demander un rendez-vous » dans Mes demandes doit rester conditionnée à `planning:view`, sauf à changer un droit, ce que la spec exclut.

**Effet de bord sur `/no-access`**
- Le layout appelle `hasAnyNavigation` puis `redirect("/no-access")` (spec 038 CA10).
- Si Mes demandes devient une entrée universelle, aucun compte n'est plus jamais « sans navigation ». `/no-access` devient inatteignable et un compte sans rôle voit une coquille.

**Risque.** **Élevé** si l'on ouvre la page sans revoir la garde de l'API : un utilisateur sans `members:view` verrait une page vide ou serait refusé en écriture. **Moyen** en sécurité : la lecture est filtrée par `submittedById` ; il faut le vérifier dans `my-requests-data`.

**Coût.** M, car il faut redéfinir ce qu'un compte sans `members:view` peut **déposer**.

**Décisions pour le plan**
- Ouvrir la lecture seule de ses propres demandes, ou aussi le dépôt ?
- Quel type de demande est autorisé sans `members:view` ?
- L'entrée Mes demandes doit-elle être exclue de `hasAnyNavigation` ?

### 1.3 « Mes inscriptions »

**Ce qui est touché**
- `billetterie/mes-reservations` : `requireAuth` seul, `listMyBookings(userId)` par email, toutes églises confondues.
- `formulaires/mes-reponses/page.tsx:8-11` : `requireAuth` seul, `listMemberResponses(session.user.id)`, liens vers le public `/f/<église>/<form>`.

**Risque**
- Sécurité nulle : on n'agrège que ses propres données.
- Risque de **propriété** : une page fusionnée appartient au noyau et doit appeler deux modules désactivables. `src/app` peut importer `@/modules/ticketing` et `@/modules/forms` par leur index (règle 11), à condition de gater par `registry.has`.
- Périmètre : les réservations sont multi-églises, ce qui diffère de l'église courante utilisée partout ailleurs.

**Coût.** S si l'on garde deux pages reliées par des onglets, M pour une page fusionnée.

**Décision pour le plan.** Faut-il une page noyau ou deux pages de module sous un même parent ?

### 1.4 Familles dans Ressources

**Ce qui est touché**
- Seule l'entrée de navigation bouge : le module `integration`, `/integration/*`.
- La garde reste `requireIntegrationAccess()` (`src/modules/integration/auth.ts`), avec un accès restreint pour berger ou conseiller.
- Le libellé et l'espace changent ; il n'y a aucune nouvelle donnée.

**Risque.** Faible côté code. Pour les utilisateurs, « Ressources » (Salles, Offres) accueille un sujet pastoral : à valider.

**Coût.** S.

### 1.5 Libellés

**Occurrences mesurées (src | tests | docs)**

| Libellé | src | tests | docs |
|---|---|---|---|
| « Agenda de l'église » | 13 | 6 | 1 |
| « Vue agenda » | 2 | 4 | 3 |
| « Demande RDV pastoral » | 2 | 5 | 1 |
| « Comptabilité » | 47 | 19 | 11 |
| `"Demandes"` | 18 | 17 | 1 |
| `"Salles"` | 11 | 2 | 0 |
| `"Collectes"` | 7 | 1 | 0 |
| « Paramètres intégration » | 3 | 1 | 1 |

**Fils de navigation écrits en toutes lettres**
- `GuideContent.tsx` : « Administration » 12, « Demandes » 13, « Comptabilité » 9, « › » 4, « → » 4.
- Fiches de l'assistant : « Demandes » 13, « Planning » 13, « Comptabilité » 10, « › » 11.

**Risque.** Faible, mais diffus. Les `hrefLabel` de l'assistant décrivent le fil de navigation : un libellé changé sans eux donne des réponses fausses.

**Coût.** M, essentiellement pour le contenu.

### 1.6 Rôle principal à priorité fixe

**Ce qui est touché**
- `layout.tsx:582` : `currentRole = churchRoles.find(...)?.role ?? "DEPARTMENT_HEAD"`. Ce rôle est l'**ordre d'arrivée en base** ; `loadChurchRoles` (`src/lib/auth.ts:198-212`) n'a pas d'`orderBy`.
- Il est utilisé par :
  - la barre du bas (`AuthLayoutShell:150`) ;
  - `GuidedTour` (`getTourSteps`, `GuidedTour.tsx:309`) ;
  - le guide (`guide/page.tsx:10-12`, même repli `DEPARTMENT_HEAD`).
- Même indéterminisme pour l'église courante par défaut (`auth.ts:909`, `churchRoles[0]`) et pour `churchName` dans l'assistant (`_viewer.ts:95`).
- Le rôle Secrétaire « virtuel » (`addVirtualSecretaryRoles`, `auth.ts:333-352`) est **ajouté à la fin** et ne sera donc jamais le premier. Il faut décider s'il entre dans la priorité.

**Risque.** Faible : c'est une correction. Seul l'affichage change, aucun droit. Les instantanés `layout-props.test.ts.snap` (180 chemins) bougeront.

**Coût.** S.

**Décision pour le plan.** Quel ordre de priorité ? Le rôle virtuel compte-t-il ? Faut-il trier aussi `churchRoles` pour l'église par défaut ? C'est hors spec, mais c'est le même défaut.

### 1.7 Barre du bas

**Ce qui est touché**
- `navigation.ts:827-852` : destinations par rôle, `prefixes` utilisés pour l'état actif. La branche pastorale contient `/admin/members` en dur (l.852).
- `BottomNav` et `AuthLayoutShell`.

**Risque.** Faible. Les `prefixes` doivent suivre les nouvelles URL, sinon l'onglet actif est faux, sans erreur visible.

**Coût.** S.

### 1.8 « Plus » groupé

**Ce qui est touché.** `MoreSheet` et `CONFIG_BLOCKS` / `sidebarBlock` (`navigation.ts:242`, l.307-368). Les blocs existent déjà pour la barre latérale et sont réutilisables.

**Risque.** Faible.

**Coût.** S.

### 1.9 Accueil « À traiter »

`accueil/page.tsx` fait 545 lignes et 8 `await`. Disponibilité d'un compteur réutilisable, file par file :

| File | Compteur réutilisable aujourd'hui | Source |
|---|---|---|
| Secrétariat | **Oui** | `loadRequestQueue` + `resolveRequestQueueAccess` (`@/modules/planning`) ; `todo = EN_ATTENTE` dans `secretariat/requests/page.tsx:31-32` |
| Comptabilité (à valider, à remettre, à justifier) | **Non** : calcul en ligne | `accounting/requests/page.tsx:86-98`. L'assistant `accounting.toValidate` (`_data/finances-autres.ts:135-158`) a **sa propre requête** prisma : divergence déjà présente |
| Justificatifs | Oui | `countOpenJustifications` (`accounting/services/justifications.ts:302`) |
| Suivi pastoral (care) | Non : calcul en ligne | `care/page.tsx:72-90` (`isUnassignedDue` / `isUnscheduledDue`) |
| Candidatures « à compléter » | Partiel | `countToComplete` (serving interviews:243) ; onglets calculés côté client |
| Paiements de billetterie à traiter | Non : aucun écran agrégé | Boucle par événement (`ticketing.paymentsToHandle`, N × `listPayments`) |
| Remplacements | Non : aucun écran de liste | `planning.toReplace` en prisma brut ; seul `/planning/remplacements/[id]` existe |
| Questionnaires soumis | Non : aucun écran agrégé | `progressCounts` par campagne |

**Risque**
- **Élevé** pour la règle « même compteur que l'écran ». Pour quatre files, il n'existe pas d'écran dont reprendre le compteur, et deux calculs existants divergent déjà (compta).
- Performance : 8 `await` existants. Ajouter jusqu'à 8 files, dont une boucle N-événements pour la billetterie, alourdit la page de connexion de **chaque** utilisateur.

**Coût.** L, à cause de l'extraction des compteurs dans les modules, des tests de parité écran/accueil et de la performance.

**Décisions pour le plan**
- Extraire `countX()` dans chaque module, appelé à la fois par l'écran et par l'accueil (une seule règle, comme les `_core.ts` du MCP).
- Que faire des files sans écran : créer l'écran, ou retirer la file de l'accueil ?
- Charger en `Promise.all` avec un ou plusieurs `Suspense`.

### 1.10 Liens parents et retour

**Ce qui est touché**
- Le fil d'Ariane et le chevron mobile viennent de `navigation.ts` (l.767 pour la branche pastorale), avec les tests `nav-match.test.ts` (21 assertions de chemins) et `navigation-subpages.test.ts` (85).
- Les liens « Retour » écrits en dur dans les pages sont compris dans les 193 `href="/…"`.

**Risque.** Faible, mais il dépend de la carte d'URL : une hiérarchie d'URL alignée sur les espaces rend le parent **déductible** du chemin.

**Coût.** M, couplé à 1.13.

### 1.11 Actions dans la palette

**Ce qui est touché**
- Liens profonds existants : `/requests/new`, `/accounting/requests/new` et `/care/request?new=1`.
- **Absents** :
  - créer un événement (`admin/events` n'a pas de `?new`) ;
  - déclarer une absence (`disponibilites` n'accepte que `month` / `event` / `member`) ;
  - nouvelle écriture de trésorerie (`tresorerie` n'accepte que `onglet`).
- Chaque action doit reprendre la garde de son écran ; la palette ne décide d'aucun droit.

**Risque.** Faible. Il faut ajouter des paramètres d'ouverture sur trois écrans clients.

**Coût.** S à M.

### 1.12 Vue pastorale en filtre, suppression des écrans pastoraux en double

| Écran pastoral | Écran commun visé | Obstacle |
|---|---|---|
| `/pastoral/members` | `/admin/members` | `readOnly={!canManage}` existe ; `canLink` dépend de `access:manage`. La page exige `members:view`, présent dans `PASTORAL_READ_PERMISSIONS`. Faisable |
| `/pastoral/events` | `/events` | `events:view` est dans `PASTORAL_READ_PERMISSIONS`. Faisable |
| `/pastoral/reports` | `/admin/reports` | **`reports:view` n'est pas dans `PASTORAL_READ_PERMISSIONS`** (`src/lib/auth.ts:486-492`). L'export API exige `reports:view` (`api/events/reports/export/route.ts:17`). `EventReportClient` n'a **pas de mode lecture seule**. **Défaut existant** : `pastoral/reports/page.tsx:90,119` renvoie vers `/admin/events/:id/report`, que `admin/events/[eventId]/report/page.tsx:41-46` refuse à un pasteur sans rôle (il faut `events:manage` ou `reports:view`) |
| `/pastoral/accounting` | `/accounting/requests` | `accounting:view` n'est **pas** dans `PASTORAL_READ_PERMISSIONS` (il n'y a que `accounting:stats`). La page commune gère déjà `isPastoral` (portée « tout »), mais `/accounting/requests/[id]:47-56` restreint la consultation d'un non-gestionnaire non-auteur à son périmètre : **un pasteur est refusé sur le détail**, alors que `pastoral/accounting/page.tsx:97,138` y renvoie déjà (même défaut). Les indicateurs annuels et les « Retards paiement » (l.34-88) n'existent pas sur l'écran commun |

**Risque.** **Élevé.** Supprimer les écrans en double impose soit d'**étendre** `PASTORAL_READ_PERMISSIONS` (`reports:view`, `accounting:view`), soit d'ajouter un mode lecture seule plus des exceptions pastorales dans deux écrans communs et une route de détail. Les deux contredisent le « aucun droit ne change » de la spec, ou au minimum l'obligent à le préciser.

**Coût.** L.

### 1.13 Alignement des URL et redirections permanentes

Voir § 2.1 à 2.9. **Risque très élevé**, **coût L** : 122 pages, 960 littéraux hors tests et 425 dans les tests.

---

## 2. Impacts par domaine

### 2.1 URL

**Mécanique Next.js 16**
- Les `redirects` de `next.config.ts` s'exécutent **avant** le proxy (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:238` : headers, redirects, Proxy, beforeFiles, filesystem).
- `permanent: true` renvoie un 308, mis en cache sans limite par les navigateurs.
- Redirections déjà présentes : `next.config.ts:28-33`, qui couvrent `/agenda/requests`, `/agenda/request` et `/admin/integration/requests/:id`.

**Blocage 1 : collision avec les sites d'événement (ADR-0031)**
- Le proxy traite d'abord les hôtes de site (`src/proxy.ts:33-35`), avec `SITE_PAGE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/` (l.68-69).
- Les identifiants de page de site sont à un seul segment (`ticketing/site-schemas.ts:70-74`). Les pages par défaut sont **`accueil` et `billetterie`** (l.440-441).
- Une redirection `next.config` de source `/billetterie` (ou `/dons`, `/agenda`…) s'appliquerait **aussi sur `<slug>.SITE_BASE_DOMAIN` et les domaines dédiés**. La page « Billetterie » de tous les sites publiés serait cassée.
- Remède au choix :
  - condition `missing: [{ type: "host", value: "<regex des hôtes de site>" }]` ; fragile, car les domaines dédiés sont dynamiques ;
  - **redirections dans le proxy, après la branche des hôtes de site** ; c'est la solution recommandée.

**Blocage 2 : jetons publics `/media/c|d|g|v/[token]`**
- Ces routes vivent sous le préfixe de l'espace `(auth)` `/media`.
- Toute redirection joker `/media/:path*` vers `/medias/:path*` casserait les liens de partage envoyés par WhatsApp et par email.
- Il faut énumérer les sources, jamais de joker.

**Règles de rédaction des redirections**
- Pas de `:path*` là où la structure change. Exemples : `/media/(visuels)/projects` devient `/medias/visuels`, et `/admin/events/[id]/report` devient `/evenements/comptes-rendus/[id]`.
- Une destination ne commence jamais par un paramètre (prévention de la redirection ouverte).
- Écraser les chaînes : `/agenda/request` puis `/care/request` doit pointer directement vers la cible finale.

**Connexion.** `safeNext` (`src/app/page.tsx:26-29`) n'accepte que `/mcp/autoriser?`, et le proxy redirige l'utilisateur non connecté vers `/` sans `next` (`proxy.ts:160-166`). Un vieux lien suivi sans session finit donc sur `/accueil` et la cible est perdue. C'est le comportement actuel, aggravé par la migration.

**Volume.** 122 pages qui changent, soit environ 70 règles une fois les familles regroupées par préfixe, sans compter les `[id]`. La carte proposée est dans `mapping.txt`.

### 2.2 Liens générés par le serveur

Ces liens **ne sont pas rattrapés par le code** ; seules les redirections les sauvent.

**`Notification.link`**
- Champ `String?` (`prisma/schema.prisma:799`), servi tel quel par la cloche (`NotificationBell.tsx:55-57`) et par Web Push (`deliverPendingPush`).
- 78 sites d'écriture `link:` littéraux. Valeurs les plus fréquentes : `/accounting/requests/` 10, `/billetterie/` 7, `/requests` 6, `/absences` 6, `/formulaires` 6, `/planning` 5, `/integration/requests/` 3, `/dashboard` 3.
- Une purge existe (`src/lib/notifications.ts:182`, `deleteMany`), mais sa durée de conservation n'a pas été vérifiée.

**Emails**
- `src/lib/email.ts` compose `${appUrl}${params.link}` (l.111, 161, 701) ainsi que `/profile/notifications` (l.63, 78).
- URL absolues dans les services :
  - `accounting/services/requests.ts:56` ;
  - `api/accounting/requests/[id]/route.ts:293` ;
  - `api/accounting/payments/[id]/route.ts:100` ;
  - `care/services/followups.ts:281` ;
  - `integration/services/family-service.ts:84` ;
  - `jobs lifecycle-service:112`.
- Les emails déjà envoyés sont **permanents** : la redirection doit vivre au moins aussi longtemps que leur pertinence (plusieurs mois pour la compta).

**Textes à copier dans WhatsApp**
- `campaigns/services/messages.ts:298` (`${appUrl}/collectes`, variable `{{lien}}` l.80-96).
- `jobs/whatsapp-recap.ts:59,79` (`/jobs/…`).
- Ces liens circulent hors de l'application et pour une durée indéterminée.

**Assistant et MCP**
- `_tools.ts:120-169` renvoie des liens absolus `${publicOrigin()}${href}`.
- `_actions/site.ts:131` produit `/billetterie/${id}/images` ; `draft.ts` utilise `requestPrefillHref` (`/requests/new`, importé depuis `@/app/(auth)/requests/prefill`).
- Questions de données : `planning.ts` 17 littéraux, `finances-autres` 13, `serving` 6, `audio-reports` 4, `campaigns` 3.

**Service worker et manifeste**
- `public/sw.js:101-112` : `notificationclick` se replie sur `/accueil` ; `STATIC_ASSETS` = `/` et `/accueil`.
- `start_url` vaut `/accueil` (`api/app-icon/manifest/route.ts:15`), sans `shortcuts`.
- Aucun impact tant que `/accueil` reste inchangé.

**QR codes.** Tous visent des URL publiques ou des codes hors URL (`KOINONIA-BADGE:`, `KOINONIA-REPAS:`…). **Aucun impact.**

**Chemins stockés en base**

| Donnée | Impact |
|---|---|
| `Notification.link` | Les redirections suffisent. Une migration SQL optionnelle n'aiderait que la cloche ; les emails sont déjà envoyés |
| **`AssistantEntry.href` et `AssistantEntry.screens`** (`schema.prisma:4049-4071`) | **Migration obligatoire.** `screens` est comparé au `pathname` par préfixe (`knowledge.ts:153`) ; une redirection n'y change rien, les fiches contextuelles cessent simplement de s'afficher. `href` envoie vers des 308 |
| `AssistantEmbedding` (clé `hash`) | Si le `href` ou le `hrefLabel` entre dans le texte vectorisé, les empreintes changent et des recalculs ont lieu (à vérifier dans `embedder.ts`) |
| `SystemMessage.linkUrl` (`schema:2934`, chemins relatifs acceptés, `messages/schemas.ts:37-43`) | Les messages programmés ou en cours pointent vers d'anciens chemins. Redirection, ou migration SQL |
| `Campaign.messageTemplates` | Variables `{{lien}}` seulement : aucun impact, sauf texte libre écrit à la main |

### 2.3 Sécurité et permissions

**Trou existant ADR-0012, confirmé par sonde (`probe.ts`)**
- Avec `messages`, `assistant`, `mcp` ou `ticketing` désactivé, `/admin/messages`, `/admin/assistant`, `/admin/mcp` et `/admin/site-domains` se résolvent sur le noyau `/admin` : **aucun 404**.
- Avec `shuttle` ou `treasury` désactivé, `/accounting/navette` et `/accounting/tresorerie` se résolvent sur `accounting`.
- La cause : la résolution par plus long préfixe **parmi les modules actifs** retombe sur un parent quand le propriétaire est éteint.
- Avec des préfixes d'espace (`/finances/navette`, `/evenements/billetterie`, `/pastoral/suivi`, `/plateforme/assistant`), **le défaut devient systématique**.
- Correctif (S) : résoudre sur la table **complète**, puis marquer `orphan` si le propriétaire est inactif. C'est un prérequis du lot URL. Ajouter un test « module X désactivé ⇒ ses chemins répondent 404 » pour chaque module imbriqué.

**Gardes de layout perdues**
- `admin/layout.tsx` fait `requireAuth` + `getCurrentChurchId` + `requireChurchAccess`. Cette garde est **faible** : elle accepte n'importe quel rôle ou profil pastoral de l'église.
- Chaque page admin qui déménage porte sa propre garde :
  - `requireChurchPermission` pour members, discipleship, events, reports, welcome-duty et rooms ;
  - `requireSuperAdmin` pour Plateforme ;
  - `admin/events/[eventId]/report/page.tsx:41-46` vérifie sur `event.churchId`.
- Sortir de `/admin` ne perd donc que `requireChurchAccess` ; le risque est faible. Il faut une liste de contrôle page par page plus un test qui exige une garde explicite dans chaque `page.tsx` déplacé.
- Les layouts `audio`, `communication`, `media` et `media/(visuels)` portent `requireAuth` et le message « Aucune église sélectionnée » ; `media/(visuels)` affiche aussi `SpaceTabs` (`resolveMediaSpaceAccess` / `buildVisualsTabs`). Ils sont à déplacer **avec** leurs pages.

**Droits**
- Mes demandes : voir § 1.2 (`members:view` sur la page et sur l'API, `planning:view` pour le rendez-vous pastoral).
- Vue pastorale : voir § 1.12 (`reports:view` et `accounting:view` absents de `PASTORAL_READ_PERMISSIONS`).
- Mes inscriptions : aucun nouveau droit.
- Palette : chaque action doit être filtrée par la même règle que l'écran.

**Redirection ouverte.** Destinations fixes uniquement.

### 2.4 « À traiter »

Voir § 1.9.
- Deux compteurs sont réutilisables tels quels (Secrétariat, justificatifs).
- Deux sont à extraire de pages (compta, care).
- Quatre n'ont pas d'écran (paiements billetterie, remplacements, questionnaires soumis, et candidatures en partie).
- Il faut ajouter un test de parité par file, même fonction appelée par l'écran et par l'accueil, sur le modèle du partage `_core.ts`. Le compteur compta de l'assistant est à réaligner au passage.

### 2.5 Tests

- 425 littéraux dans 57 fichiers. Les plus chargés :
  - `navigation.test.ts` : 113 littéraux, 68 `expect` ;
  - `navigation-subpages.test.ts` : 85 / 46 ;
  - `navigation-campaigns` : 31 / 20 ;
  - `nav-match` : 21 / 8 ;
  - `knowledge.test` : 20, avec `SCREEN_PERMISSION` indexé par chemin (l.37, 71-79), qui vérifie que chaque `href` est une vraie page ;
  - `primitives` : 10 ;
  - `proxy-site` : 9 ;
  - `navigation-shuttle` : 9 ;
  - `star-navigation` : 9 / 19 ;
  - `module-routes` : 8 ;
  - `proxy-modules` : 6.
- **Instantanés** :
  - `(auth)/__tests__/__snapshots__/layout-props.test.ts.snap` contient 180 chemins ;
  - `accueil/__tests__/__snapshots__/page.test.ts.snap` en contient 4 ;
  - `site/__tests__/__snapshots__/site-render.test.ts.snap` ne doit **pas** bouger. C'est un garde-fou utile contre le blocage 1.
- 37 tests colocalisés sous `(auth)`, qui suivront `git mv`.
- `routes-exhaustivite.test.ts` vérifie chaque `page.tsx` contre les manifestes (l.53-96). C'est un filet utile, mais il ne détecte pas le trou du § 2.3.
- Aucun test de bout en bout : aucun test ne vérifie qu'un **lien rendu** pointe vers une page existante, hors fiches de l'assistant.
- À ajouter :
  1. test « tout `href` littéral de `src` correspond à une page ou à une redirection », en réutilisant la logique de `knowledge.test` ;
  2. test des redirections (table source vers destination, aucune chaîne, aucune source sur une page de site) ;
  3. test des modules désactivés (§ 2.3).
- Coût : M à L, avec beaucoup de mécanique.

### 2.6 Documentation

- À réécrire :
  - CLAUDE.md : 44 chemins, dont l'arbre « Structure du projet » ;
  - `docs/auth.md` : 19 ;
  - `architecture`, `database`, `production` : 8, 7 et 7 ;
  - `guide-screenshots.md` : 69 chemins et 79 captures à refaire si la barre latérale change ;
  - ADR-0019 (4 chemins), ADR-0031 (1), ADR-0023 (1).
- Contenu utilisateur :
  - `GuideContent.tsx` : 932 lignes ;
  - fiches de l'assistant : environ 2 027 lignes, 211 chemins plus les fils de navigation en toutes lettres ;
  - `tour-steps.ts` : 144 lignes.
- Les `specs/` passées (755 occurrences) sont un historique et ne se réécrivent pas.
- `openapi.json` : 0 chemin de page. Seules des descriptions en prose (`jobs/unseen-count/contract.ts:6,13`, `dev-login/contract.ts:10`) peuvent être régénérées, sans obligation.
- Un nouvel ADR est nécessaire (règle 13) : convention d'URL par espace, propriété des pages d'accueil d'espace, politique de redirection et de durée, et correctif de la résolution ADR-0012.

### 2.7 Exploitation

- Traefik route par hôte seulement (`docs/production.md:222`, `staging.md:33`) : aucun impact. Aucun CDN devant (`production.md:262-264`) et aucun outil d'analyse d'audience : pas de purge à prévoir.
- **Service worker (ADR-0026)**
  - Cache `koinonia-v6`, pages en réseau d'abord avec repli sur le cache indexé **par URL**.
  - Les écrans hors ligne `/billetterie/[id]/controle` et `/restauration` mis en cache sous l'ancienne URL ne sont **pas trouvés** hors ligne sous la nouvelle.
  - Les données IndexedDB (`koinonia-offline`) sont indépendantes de l'URL et ne sont pas perdues.
  - Mesures :
    - ne pas basculer pendant un événement de billetterie ouvert ;
    - incrémenter le cache (`koinonia-v7`) ;
    - prévenir les organisateurs de rouvrir l'écran en ligne une fois.
- **308 et retour arrière**
  - Le 308 est mis en cache sans limite. Si on revient à l'ancienne version après la bascule, les navigateurs continuent d'envoyer vers les nouvelles URL, qui renvoient alors un 404.
  - Mesures :
    - **307 pendant 2 à 4 semaines**, puis 308 ;
    - une image de retour arrière capable de servir les nouvelles URL par redirections inverses.
- **Favoris et applications installées.** Pas de `shortcuts` dans le manifeste et `start_url` est inchangé. Seuls les favoris des utilisateurs dépendent des redirections, d'où la nécessité de les conserver **sans échéance**, ou au minimum 12 mois.
- **Migrations de données.** `AssistantEntry.screens/href` (obligatoire), `SystemMessage.linkUrl` (recommandée), `Notification.link` (optionnelle). Elles doivent être idempotentes et réversibles, par une table de correspondance appliquée dans les deux sens. Le job `migrations` de la CI rejoue sur une base vierge, donc les migrations ne doivent pas supposer de données.

### 2.8 Frontières des modules

- Les pages d'accueil d'espace (`/finances`, `/evenements`, `/pastoral`, `/personnes`, `/medias`, `/ressources`, `/plateforme`) relèvent du noyau. Elles n'importent les modules que par leur index et gatent par `registry.has`.
- `src/app` peut importer les modules par leur index (règle 11). Les modules restent sans dépendance entre eux : `.dependency-cruiser.cjs` comprend 18 règles `no-X-imports-other-modules`, dont l.18-200.
- **Imports `@/app/(auth)/…`**
  - 151 imports de squelettes de chargement ;
  - plus des imports métier : accounting 3, requests 2 (dont `api/mcp/_actions/draft.ts` qui importe `@/app/(auth)/requests/prefill`), jobs 2, planning 1, dons 1 ;
  - plus 42 imports relatifs `../../` sous `(auth)`. `accueil/page.tsx` importe `../planning/MyPlanningView`, `../planning/my-planning-data`, `../requests/my-requests-data` et `../requests/request-display`.
- Déplacer les dossiers casse ces imports. `typecheck` les détecte tous, mais c'est l'occasion de remonter `prefill`, `my-requests-data` et `my-planning-data` dans `src/lib` ou dans le module.
- Les manifestes contiennent 65 littéraux de `routes` à réécrire, plus 9 entrées `navigation:` mortes à supprimer.
- Le module `campaigns` sous `/demandes/questionnaires` se résout correctement par plus long préfixe, sous réserve du correctif § 2.3. Même chose pour `ticketing` et `forms` sous `/evenements`, et pour `shuttle`, `treasury` et `giving` sous `/finances`.

### 2.9 Ordre des lots et retour arrière

Ordre recommandé :

| Lot | Contenu | Retour arrière |
|---|---|---|
| **0** | Résolution ADR-0012 sur la table complète, avec tests des modules désactivés ; rôle principal déterministe ; correction des défauts existants (liens pastoraux vers le détail de compte rendu et de demande) ; **registre central des chemins** (`src/lib/paths.ts` ou équivalent, constantes et fonctions `path.finances.request(id)`) qui remplace les littéraux **sans changer les URL** | Trivial |
| **1** | Navigation : espaces, libellés, barre du bas, « Plus », fil d'Ariane, sur les **URL actuelles** | Trivial (code seul) |
| **2** | Mes demandes, Mes inscriptions, palette, « À traiter » (compteurs extraits) | Trivial |
| **3** | Vue pastorale en filtre, après décision sur les droits (§ 1.12) | Réversible si les écrans pastoraux sont conservés une version |
| **4** | Bascule des URL : `git mv`, routes des manifestes, redirections **dans le proxy** en **307**, migrations `AssistantEntry` et `SystemMessage`, cache du service worker en v7. Le contenu (guide, fiches, parcours, docs, captures) est mis à jour **dans la même PR** | Image de retour arrière avec redirections inverses ; migrations réversibles |
| **5** | Passage en 308 après 2 à 4 semaines sans anomalie | Non réversible côté navigateurs, d'où son report |

Le lot 0 (registre des chemins) divise le coût du lot 4. Une fois les littéraux centralisés, la bascule modifie un seul fichier plus les `git mv`, au lieu de 960 lieux.

---

## (a) Tableau de synthèse

| Choix | Fichiers et volume principaux | Risque | Coût | Point bloquant ou décision |
|---|---|---|---|---|
| Espaces | `navigation.ts` (86 littéraux), `layout.tsx`, 5 barres, `tour-steps` | Moyen | M | Pages d'accueil d'espace au noyau ; collision `/pastoral` ; `/events` et `/planning/events` |
| Mes demandes pour tous | `requests/page.tsx:20`, `new:20`, `edit:22`, `api/requests:137,172`, `care/request:38`, `api/care/requests:67`, `hasAnyNavigation` | **Élevé** | M | Dépôt sans `members:view` ? ; rendez-vous gaté par `planning:view` ; `/no-access` |
| Mes inscriptions | 2 pages `requireAuth` | Faible | S à M | Page noyau ou onglets ; périmètre multi-églises |
| Familles dans Ressources | Navigation seule | Faible | S | Cohérence du libellé |
| Libellés | « Comptabilité » 47, « Demandes » 18, fiches `hrefLabel` 105 | Faible, diffus | M | Traiter le contenu avec les URL |
| Rôle principal | `layout.tsx:582`, `auth.ts:198,909`, `_viewer.ts:95`, rôle virtuel `auth.ts:333` | Faible | S | Ordre de priorité ; rôle virtuel |
| Barre du bas | `navigation.ts:827-852` | Faible | S | `prefixes` |
| « Plus » groupé | `MoreSheet`, `CONFIG_BLOCKS` | Faible | S | — |
| À traiter | 8 files, dont 4 sans écran ; compta divergente | **Élevé** | L | Règle « même compteur » intenable telle quelle ; performance |
| Parents et retour | Fil d'Ariane, `nav-match` (21), `subpages` (85) | Faible | M | Dépend de la carte d'URL |
| Actions de palette | 3 écrans sans lien profond | Faible | S à M | Paramètres `?new` |
| Vue pastorale en filtre | `auth.ts:486-492`, `admin/reports`, `EventReportClient`, `accounting/requests/[id]:47-56` | **Élevé** | L | Contredit « aucun droit ne change » |
| URL et 308 | 122 pages, 960 littéraux, 425 dans les tests, 52 `redirect`, 78 `link:`, données en base | **Très élevé** | L | Sites d'événement ; `/media` public ; ADR-0012 ; 308 et retour arrière ; service worker |

## (b) Risques majeurs, classés

1. **Redirections `next.config` appliquées aux hôtes de site d'événement.** La page par défaut « billetterie » (`site-schemas.ts:440-441`) serait cassée sur chaque site publié dès qu'une source `/billetterie` existe. Il faut rediriger dans le proxy après `siteHostRoute`.
2. **Résolution ADR-0012 par repli sur un parent actif.** Les écrans d'un module désactivé restent servis (déjà vrai pour 6 chemins, confirmé par sonde) et deviendraient servis de façon systématique sous des préfixes d'espace. À corriger avant tout déplacement.
3. **308 mis en cache sans limite et retour arrière impossible** côté navigateurs. Il faut du 307 d'abord, puis une image de retour arrière à redirections inverses.
4. **Vue pastorale en filtre** sans `reports:view` ni `accounting:view` dans `PASTORAL_READ_PERMISSIONS` : soit l'extension d'un droit, soit des exceptions de lecture seule dans des écrans communs qui n'ont pas de mode lecture seule.
5. **`AssistantEntry.screens`** est comparé par préfixe de `pathname`. Les redirections n'y peuvent rien et l'aide contextuelle disparaît sans erreur visible. Migration de données obligatoire.
6. **Liens hors application** (emails déjà envoyés, notifications et push, textes WhatsApp de campagnes et d'offres, liens MCP absolus) : ils ne dépendent que des redirections, donc des redirections conservées sans échéance.
7. **Joker `/media/:path*`** qui casserait les partages publics `/media/c|d|g|v/[token]`.
8. **Mes demandes ouvert à tous** et `hasAnyNavigation` : `/no-access` devient inatteignable, et l'écriture est refusée par l'API (`members:view`).
9. **« À traiter » : règle du même compteur** intenable pour 4 files sans écran, compteur compta déjà divergent, et coût de chargement de l'accueil.
10. **Service worker** : les écrans hors ligne de billetterie mis en cache sous l'ancienne URL deviennent introuvables hors ligne. Il ne faut pas basculer en période d'événement.

## (c) Décisions techniques à trancher au plan

1. Où vivent les redirections : **proxy, après la branche des hôtes de site**, ou `next.config` avec condition `missing host` ? La première option est recommandée.
2. Politique de statut : 307 pendant N semaines puis 308 ; durée de conservation des redirections (sans échéance recommandée) ; écrasement des chaînes ; aucune source joker sur `/media`.
3. Correctif de résolution ADR-0012 (table complète, puis `orphan` si le propriétaire est inactif) avant le lot URL, avec tests des modules désactivés.
4. **Registre central des chemins** (lot 0) et test « tout `href` littéral résout une page ou une redirection ».
5. Propriété des pages d'accueil d'espace (noyau, `NOYAU_ROUTES`) et liste de leurs préfixes exacts.
6. Carte d'URL définitive (proposition dans `mapping.txt`) :
   - garder `/admin` pour l'administration d'église, ce qui évite une vingtaine de redirections ;
   - `/plateforme/*` pour le Super Admin ;
   - préfixe de l'espace Pastoral ;
   - sort de `/planning/events` par rapport à `/events` ;
   - exceptions `/profile`, `/guide`, `/mcp/autoriser` (adresse OAuth enregistrée chez les clients), `/messages/[id]` et `/accueil`.
7. Migrations de données : `AssistantEntry.href/screens` (obligatoire, avec vérification des empreintes `AssistantEmbedding`), `SystemMessage.linkUrl`, éventuellement `Notification.link`. Idempotentes et réversibles.
8. Ordre de priorité du rôle principal, dont le rôle Secrétaire virtuel, et tri déterministe de `churchRoles` (église par défaut).
9. Mes demandes : ce qu'un compte sans `members:view` peut **déposer** ; exclusion de cette entrée du calcul `hasAnyNavigation`.
10. « À traiter » : un `countX()` par module partagé avec l'écran ; sort des files sans écran ; chargement parallèle et `Suspense`.
11. Calendrier de bascule hors période d'événement de billetterie ; cache du service worker en v7 ; consignes aux organisateurs.
12. Redirections `redirect("/admin")` des pages Super Admin à rediriger vers `/plateforme`.
13. Nouvel ADR (convention d'URL, propriété, politique de redirection, correctif ADR-0012) et amendements d'ADR-0012, 0019 et 0031.

## (d) Choix de la spec à reconsidérer

1. **« Permanentes » dès la bascule** : préférer un 307 transitoire, puis un 308. Le retour arrière n'est sinon pas maîtrisé.
2. **Tout aligner d'un coup** : le gain d'URL est faible pour l'administration d'église (`/admin`), qui est déjà cohérente. Ne la garder que là où le coût est élevé. Plus largement, découpler la navigation (lots 1 à 3, réversibles) de la bascule d'URL (lot 4, irréversible) : la spec gagnerait à admettre une URL qui diffère de l'espace.
3. **Vue pastorale en filtre et suppression des doublons** : en l'état, elle impose d'ajouter `reports:view` et `accounting:view` aux droits pastoraux, ou d'ajouter des exceptions de lecture dans des écrans communs. Cela contredit « aucun droit ne change ». Soit la spec acte cette extension explicitement, soit elle garde provisoirement `/pastoral/reports` et `/pastoral/accounting`, en corrigeant leurs liens cassés vers le détail.
4. **« Même compteur que l'écran »** : intenable pour 4 files sans écran. Préciser « même fonction de comptage, partagée », ou retirer ces files de l'accueil tant qu'elles n'ont pas d'écran.
5. **Mes demandes « ouvert à tous »** : préciser s'il s'agit de la lecture seule de ses propres demandes ou aussi du dépôt, et maintenir le rendez-vous pastoral sous `planning:view`. Préserver `/no-access` (spec 038 CA10).
6. **Mes inscriptions comme nouvelle page** : deux pages liées sous un même parent suffisent au besoin (coût S) et évitent une page noyau qui dépend de deux modules désactivables.
7. **Familles dans Ressources** : sujet pastoral rangé avec Salles et Offres. À valider avec les utilisateurs, ou placer sous Personnes.
8. **Exceptions à la règle de préfixe** à inscrire dans la spec : `/profile`, `/guide`, `/mcp/autoriser`, `/messages/[id]`, `/accueil`, ainsi que les pages publiques (`/media/c|d|g|v`, `/f`, `/billet`…), qui ne bougent pas.
