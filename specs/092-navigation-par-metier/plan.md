# Plan technique — Navigation par métier

- **Spec associée** : `./spec.md` (Validée) · audits : [`audit.md`](audit.md), [`impacts.md`](impacts.md), [`url-mapping.txt`](url-mapping.txt)
- **ADR** : [ADR-0033](../../docs/adr/0033-architecture-information-par-metier.md) (Proposé) ; amendements d'ADR-0012, 0019 et 0031
- **Statut** : Brouillon
- **Mis à jour le** : 2026-11-27

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`. Il décrit, il
> n'implémente pas. Chaque lot est **une sous-PR** vers `feat/navigation-metier`, livrable et
> recettable seul. Les lots 0 à 3 ne changent **aucune adresse** d'écran ; seul le lot 4 en change.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe les modules que par `@/modules/X`, `/auth` ou `/schemas`. Les nouveaux compteurs de « À traiter » vivent dans les modules (`services/`) et sont réexportés par leur index. Le registre des écrans (`src/lib/paths.ts`) et la table des anciennes adresses (`src/lib/legacy-paths.ts`) sont purs, sans import de module : le proxy peut les lire (règle `proxy-only-module-routes` étendue à ces deux fichiers).
- [x] **Sécurité** : aucune garde n'est retirée. Les trois exceptions de la spec se traduisent par des gardes **explicites** (lecture pastorale par un helper dédié, appartenance à l'église pour Mes demandes et le rendez-vous), jamais par un élargissement de `requireChurchPermission` ni de `PASTORAL_READ_PERMISSIONS`. `churchId` jamais optionnel.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) ; aucune matrice ne change (le tableau de `CLAUDE.md` et `permissions.test.ts` restent identiques).
- [x] **Validation** Zod : aucune nouvelle mutation, hormis les paramètres d'ouverture de trois écrans (validés par une liste fermée côté page) ; la route `POST /api/care/requests` garde son schéma.
- [x] **Migration** Prisma : **aucun changement de schéma**. Les adresses mémorisées sont réécrites par un script de données idempotent et réversible (lot 4), pas par une migration.
- [x] **Enums** depuis `@/generated/prisma/client`.
- [x] **UI** : réutilisation de `src/components/ui/` (`Tabs`, `StatusChip`, `EmptyState`, `Alert`, `PageHeader`, `BottomSheet`) ; un seul composant nouveau, le bloc « À traiter » de l'Accueil, écrit sur ces primitives.

## Approche générale

Le fil directeur tient en deux idées.

1. **Un registre unique des écrans** (`src/lib/paths.ts`, lot 0) : chaque écran connecté y a une
   clé, un motif d'adresse et un constructeur typé (`paths.finances.request(id)`). Au lot 1, chaque
   entrée reçoit aussi son **espace**, son **parent** et son **libellé**. Tout le code (pages,
   composants, services qui écrivent des liens de notification, assistant, MCP, emails) construit
   ses adresses par ce registre. La bascule du lot 4 change alors les valeurs du registre et
   déplace les dossiers (`git mv`) ; elle ne touche plus 960 littéraux.
2. **La navigation reste une seule définition** (`src/lib/navigation.ts`), alimentée par les mêmes
   droits que le layout. Le layout ne calcule plus de liste ad hoc : il appelle
   `loadNavigationInput(session)` (extrait au lot 1), réutilisé par l'Accueil « À traiter », la
   palette et les racines d'espace. La navigation **ne décide d'aucun droit** : chaque écran garde
   sa garde serveur.

Les redirections (lot 4) vivent **dans le proxy, après la branche des hôtes de site**, dans une
table explicite sans joker : aucun risque pour les sites d'événement ni pour les liens de partage
publics. Elles sont temporaires (307) pendant l'observation, puis permanentes (308) au lot 5.

## Référentiel commun à tous les lots

### Espaces, préfixes et propriétaires

| Espace (clé) | Préfixe (lot 4) | Racine | Modules propriétaires des écrans |
|---|---|---|---|
| Accueil (`home`) | `/accueil` (inchangé) | page noyau | noyau |
| Planning (`planning`) | `/planning` | Mon planning (planning) | planning, availability |
| Événements (`events`) | `/evenements` | Calendrier de l'église (planning) | planning, ticketing, forms |
| Pastoral (`pastoral`) | `/pastoral` | redirecteur noyau | agenda, care |
| Personnes (`people`) | `/personnes` | redirecteur noyau | core (Mes membres), planning, discipleship, serving, integration |
| Demandes (`requests`) | `/demandes` | Mes demandes (planning) | planning, care, campaigns |
| Finances (`finances`) | `/finances` | redirecteur noyau | accounting, shuttle, treasury, giving |
| Médias (`media`) | `/medias` | accueil à cartes (media) | media, audio |
| Ressources (`resources`) | `/ressources` | redirecteur noyau | rooms, jobs (+ Familles, lien externe) |
| Administration (`admin`) | `/admin` (inchangé) | redirecteur noyau existant | core, planning, rooms, messages |
| Plateforme (`platform`) | `/plateforme` | redirecteur noyau | core, ticketing, assistant, mcp |

Un **redirecteur noyau** est une page sans contenu, déclarée dans `NOYAU_ROUTES` comme `/admin`
aujourd'hui : elle envoie vers la première page de l'espace accessible à la personne (calculée par
`buildSpaces`), sinon vers `/accueil`. Aucun espace n'a donc de page d'accueil à maintenir.

Restent hors préfixe d'espace (spec) : `/accueil`, `/profile/*` (dont `/profile/candidature`,
ex-« Ma fiche »), `/guide`, `/messages/[id]`, `/mcp/autoriser`, et toutes les adresses publiques
(`/donner`, `/inscription`, `/billet`, `/reservation`, `/f`, `/collecte`, `/servir`, `/entretien`,
`/rejoindre`, `/installer`, `/media/c|d|g|v/[token]`, `/agenda-public`…). Les adresses `/api/*` ne
bougent pas.

### Carte des adresses

La carte de référence est [`url-mapping.txt`](url-mapping.txt) (122 écrans). Le plan en tranche les
lignes marquées « décision » :

- `/admin/churches/[churchId]` (paramètres de l'église) → `/admin/eglise/[churchId]` ; la liste des
  églises du Super Admin (`/plateforme/eglises`) ouvre cette même page. L'identifiant reste dans
  l'adresse : c'est l'église de l'objet qui fait foi (`resolveChurchId`), pas le contexte.
- `/messages/[id]` reste à son adresse ; parent = « Messages système » pour qui a
  `messages:publish`, Accueil sinon.
- `/pastoral` devient la racine de l'espace Pastoral (redirecteur). Le tableau pastoral passe sur
  `/accueil` en vue pastorale dès le lot 3. Les écrans pastoraux en double (`/pastoral/events`,
  `/pastoral/reports`, `/pastoral/accounting`) sortent de la navigation au lot 3, restent servis
  jusqu'au lot 4, puis redirigent vers l'écran commun. `/pastoral/members` → `/personnes/mes-membres`.
- `/planning/events` (vue hebdomadaire du STAR) et `/events` (liste) : voir question ouverte 2.
- `/billetterie/mes-reservations` et `/formulaires/mes-reponses` → page noyau
  `/evenements/mes-inscriptions` (`?vue=reservations|formulaires`), qui appelle les deux modules par
  leur index et masque l'onglet d'un module inactif.
- `/care/request` → `/demandes/rendez-vous` (ouvert à tous au lot 3, donc rangé sous Demandes) ;
  l'entrée « Demander un rendez-vous » de Pastoral pointe vers la même adresse.

### Rôle principal

`primaryRole(churchRoles, churchId, isSuperAdmin)` (pur, `src/lib/roles.ts`) retourne le premier
rôle de l'église courante dans l'ordre : `ADMIN` > `SECRETARY` > `ACCOUNTANT` >
`PASTORAL_CARE_REFERENT` > `MINISTER` > `DEPARTMENT_HEAD` > `REPORTER` > `DISCIPLE_MAKER` > `STAR`.
Le Super Admin (`isSuperAdmin` ou rôle `SUPER_ADMIN`) prend le rang de l'Admin. Sans rôle d'église
(pasteur seul), il vaut `STAR`. Le rôle Secrétaire **virtuel** (`addVirtualSecretaryRoles`) entre
dans la priorité comme un rôle réel (question ouverte 6). Il remplace `churchRoles.find(…)?.role ??
"DEPARTMENT_HEAD"` partout : layout (barre du bas, visite guidée), `guide/page.tsx`.

## Modèle de données

**Aucun changement de schéma**, aucune migration Prisma. Le lot 4 réécrit des **valeurs** déjà
stockées, par script (voir lot 4) :

| Donnée | Champ | Traitement |
|---|---|---|
| Fiches de l'assistant | `AssistantEntry.href`, `AssistantEntry.screens` (JSON, préfixes) | réécriture obligatoire (l'aide contextuelle compare `screens` au `pathname`) |
| Messages système | `SystemMessage.linkUrl` (relatif ou absolu vers l'application) | réécriture |
| Notifications | `Notification.link` | réécriture (la spec l'exige ; la cloche et le push lisent ce champ) |

Les empreintes `AssistantEmbedding` ne bougent pas : `entryTexts` ne vectorise que le titre, les
questions et les alias, jamais `href` (vérifié dans `assistant/services/engine.ts:73`).

## API

Aucun nouvel endpoint, aucune adresse d'API ne change. Modifications de garde :

| Endpoint | Méthode | Avant | Après | Lot |
|---|---|---|---|---|
| `/api/care/requests` | POST | `planning:view` | membre de l'église (`requireChurchAccess(data.churchId)`), débit limité | 3 |
| `/api/events/[eventId]/report` | GET | `reports:view` ou `events:manage` | idem **ou** lecture pastorale de l'église de l'événement | 3 |
| `/api/events/[eventId]/report` | PUT | `reports:edit` ou `events:manage` | inchangé (test : un pasteur sans rôle reçoit 403) | 3 |
| `/api/accounting/requests/[id]` | GET | `accounting:view` + périmètre | idem **ou** lecture pastorale (périmètre église) | 3 |
| `/api/accounting/requests/[id]` | PATCH | inchangé | inchangé (test pasteur : 403) | 3 |

Chaque changement met à jour le `contract.ts` voisin (champ `access`) et `docs/openapi.json`
(`npm run openapi`, ADR-0023).

## Services / logique métier

- `src/core/module-routes.ts` : résolution sur la table **complète**, propriétaire inactif ⇒
  `orphan` (lot 0).
- `src/lib/paths.ts` : registre des écrans (lot 0), métadonnées d'arborescence (lot 1), nouvelles
  valeurs (lot 4).
- `src/lib/navigation-input.ts` (`server-only`) : `loadNavigationInput(session)` extrait du layout
  (lot 1).
- Compteurs de « À traiter » (lot 2), **une fonction par file**, appelée à la fois par l'écran et par
  l'Accueil :

| File | Fonction (module) | Lot |
|---|---|---|
| Demandes du secrétariat | `countRequestQueueTodo(churchId)` (`planning`, sur `loadRequestQueue`) | 2 |
| Demandes comptables à valider / à payer | `accountingQueueCounts(churchId)` (`accounting`) | 2 |
| Justificatifs à examiner | `countOpenJustifications` (`accounting`, existant) | 2 |
| Rendez-vous et suivis à qualifier | `careQueueCounts(access, churchId)` (`care`) | 2 |
| Candidatures à traiter | `countServingQueue(actor)` (`serving`) | 2 |
| Paiements de billetterie déclarés | `countPendingDeclarations(session, churchId)` (`ticketing`) | 2 |
| Remplacements demandés | `listPendingWithdrawals(session, churchId)` (`planning`) | 2 |
| Questionnaires soumis à valider | `countSubmittedContributions(session, churchId)` (`campaigns`) | 2 |

- `hasPastoralRead(session, churchId)` (`src/lib/auth.ts`, lot 3) : vrai si l'église figure dans
  `pastoralChurchIds`. Utilisé **nommément** par les chemins de lecture des comptes rendus et des
  demandes comptables, jamais par une écriture.
- `scripts/092-rewrite-stored-paths.ts` (lot 4).

## UI / composants

`Sidebar`, `BottomNav`, `MoreSheet`, `TopBar` (fil d'Ariane, chevron) et `CommandPalette` lisent
déjà `buildSpaces`. Les changements sont dans `navigation.ts` (espaces, blocs, parents,
destinations) et dans un nouveau composant serveur `TodoBlock` de l'Accueil. `EventReportClient`
reçoit un mode `readOnly`. `AccountingNav` disparaît (ses onglets répétaient le menu, principe 6) ;
les onglets internes (Trésorerie `?onglet=`, Disponibilités ↔ indisponibilités de l'équipe, Audio,
Visuels) restent et ont pour parent l'écran qui les porte.

---

## Lot 0 — Corrections et registre unique des adresses (aucune adresse ne change)

### Objectif

Corriger les défauts qui rendraient la bascule dangereuse, et centraliser les adresses.

### Fichiers touchés

- `src/core/module-routes.ts`, `src/lib/module-routes.ts`, `src/proxy.ts` (appel inchangé),
  `src/proxy-modules.test.ts`, `src/lib/__tests__/routes-exhaustivite.test.ts`.
- `src/lib/roles.ts` (`primaryRole`), `src/app/(auth)/layout.tsx:582`,
  `src/app/(auth)/guide/page.tsx:10-12`, `src/components/GuidedTour.tsx`.
- `src/lib/navigation.ts:852` (« Mes membres » de la barre du bas pastorale → `/pastoral/members`).
- `src/app/(auth)/pastoral/reports/page.tsx:90,119`, `src/app/(auth)/pastoral/accounting/page.tsx:97,138`.
- `src/app/(auth)/accounting/requests/page.tsx:27` (`canSubmit` n'inclut plus `isPastoral` : l'API
  `POST /api/accounting/requests` exige `accounting:submit` et refuse déjà le pasteur).
- `src/core/module-registry.ts` (type `NavigationItem`, champ `navigation`) et les 9 manifestes
  (`navigation:` jamais lu, dont `/announcements` mort).
- **Nouveau** `src/lib/paths.ts` ; remplacement des littéraux de chemins d'écran dans `src/`
  (pages, composants, `lib`, services des modules, `api/assistant`, `api/mcp`, `lib/email.ts`).
- `src/app/(auth)/requests/prefill.ts` → `src/lib/request-prefill.ts` (l'import
  `@/app/(auth)/requests/prefill` de `api/mcp/_actions/draft.ts` casserait au lot 4) ;
  `my-requests-data.ts` et `my-planning-data.ts` restent en place au lot 0 (import relatif de
  l'Accueil, corrigé par `typecheck` au lot 4).
- `.dependency-cruiser.cjs` : la règle `proxy-only-module-routes` admet `src/lib/paths.ts` et
  `src/lib/legacy-paths.ts` (purs).

### Approche

1. **Résolution ADR-0012.** `RouteTable` est construite sur **tous** les manifestes et reçoit
   l'ensemble des modules actifs. `resolve()` prend le plus long préfixe parmi toutes les entrées ;
   si son propriétaire est un module inactif, le résultat est `orphan`. `isPublic()` applique la
   même règle. `activeRouteTable` et `fullRouteTable` deviennent une seule table (l'exhaustivité la
   lit sans filtre d'activité). Effet : `/admin/messages`, `/admin/assistant`, `/admin/mcp`,
   `/admin/site-domains`, `/accounting/navette`, `/accounting/tresorerie` répondent 404 quand leur
   module est coupé (sonde `probe.ts` de l'audit).
2. **Rôle principal déterministe** : `primaryRole` (référentiel ci-dessus).
3. **Liens pastoraux cassés** : en attendant la lecture pastorale (lot 3), une ligne de
   `/pastoral/reports` ou `/pastoral/accounting` n'est un lien que si la personne a le droit d'ouvrir
   la cible (`reports:view`/`events:manage`, resp. `accounting:view` et périmètre) ; sinon la ligne
   est affichée sans lien. Le bouton « Nouvelle demande » disparaît pour un pasteur sans
   `accounting:submit`.
4. **Déclarations mortes** : suppression du champ `navigation` des manifestes et de son type.
5. **Registre des écrans.** `paths.ts` exporte un objet `SCREENS` (clé → motif tel que
   `/accounting/requests/[id]`) et des constructeurs typés (`paths.accounting.request(id)`,
   `paths.dashboard({ dept })`). Les constructeurs encodent les segments (`encodeURIComponent`) et
   n'acceptent que des chaînes. Les littéraux d'écran sont remplacés, préfixe par préfixe. Un test
   à cliquet interdit tout nouveau littéral d'écran hors de `paths.ts` (liste des préfixes de
   `url-mapping.txt`, hors tests et hors `specs/`).

### Tests (Vitest)

- `module-routes.test.ts` : pour **chaque** module désactivable, ses préfixes (pages et API)
  résolvent `orphan` ; les écrans des autres modules actifs restent résolus (aucun écran ne
  dépendait du repli sur un parent). Cas nommés : `messages`, `assistant`, `mcp`, `ticketing`,
  `shuttle`, `treasury`.
- `proxy-modules.test.ts` : `GET /admin/messages` avec `messages` coupé ⇒ réécriture
  `/module-absent` (404) ; `/api/accounting/navette` avec `shuttle` coupé ⇒ 404 JSON.
- `roles.test.ts` : `primaryRole` pour toutes les combinaisons de deux rôles, dans les deux ordres
  (même résultat), Super Admin, rôle virtuel, aucun rôle ⇒ `STAR`.
- `paths.test.ts` : chaque motif de `SCREENS` correspond à une `page.tsx` réelle sous `(auth)` et
  chaque `page.tsx` sous `(auth)` a une entrée (exhaustivité, sur le modèle de
  `routes-exhaustivite.test.ts`) ; chaque constructeur produit une adresse qui satisfait son motif.
- `no-screen-literals.test.ts` : cliquet sur les littéraux.
- Instantané `layout-props.test.ts.snap` : seul le rôle de la barre du bas peut changer.

### Sécurité

- **Autorisation** : le correctif ADR-0012 ne fait que **fermer** des accès (écrans d'un module
  coupé, y compris pour le Super Admin). Aucune garde n'est modifiée.
- **Liens pastoraux** : on retire un lien vers un refus ; aucun droit ajouté.
- **Registre** : les constructeurs encodent les identifiants ; aucune adresse n'est construite à
  partir d'une saisie libre sans encodage (prévention d'une injection de chemin dans un lien de
  notification).
- **Pas de nouvelle donnée exposée.**

### Recette Playwright

Navigateur de bureau 1440×900 et mobile 390×844, connexion par `AUTH_DEV_LOGIN` sur le jeu fictif
(`docs/dev-onboarding.md`).

1. Instance avec `ENABLED_MODULES` sans `messages`, `shuttle`, `treasury` : Super Admin ouvre
   `/admin/messages`, `/accounting/navette`, `/accounting/tresorerie` ⇒ page introuvable (404).
2. Compte Comptable + STAR, rôles créés dans les deux ordres : la barre du bas est celle du Comptable.
3. Pasteur sans rôle, vue pastorale : « Mes membres » (barre du bas, barre latérale) ouvre
   `/pastoral/members` ; dans `/pastoral/reports` et `/pastoral/accounting`, aucune ligne ne mène à
   une page refusée.
4. Parcours de non-régression : chaque rôle de l'audit ouvre ses espaces ; aucune page en erreur.

### Risques

- Le remplacement des littéraux est volumineux (960 lieux) : risque de faute de frappe. Atténué
  par `typecheck` (constructeurs typés), le test d'exhaustivité et l'instantané du layout.
- Un écran qui reposait sur le repli vers un parent actif deviendrait 404 : le test « autres
  modules actifs restent résolus » le détecte.

### Retour arrière

Trivial (code seul, aucune donnée).

---

## Lot 1 — Espaces, libellés et parenté (adresses actuelles)

### Objectif

Les onze espaces de la spec, les libellés uniques, et un parent réel pour tout écran, sur les
adresses d'aujourd'hui.

### Fichiers touchés

- **Nouveau** `src/lib/navigation-input.ts` (`server-only`) : calculs extraits de
  `(auth)/layout.tsx` (droits, liens, booléens `has*`) ; le layout n'en garde que l'appel.
- `src/lib/navigation.ts` : `SpaceKey` étendu (`events`, `pastoral`, `finances`, `platform`),
  `buildSpaces`, `CONFIG_BLOCKS` (scindé Administration / Plateforme), `sidebarBlock`, libellés,
  `SUBPAGE_LABELS`, `ITEM_LABELS`, `STANDALONE_LABELS`, `parentLink`, `buildBreadcrumb`,
  `fallbackParent`.
- `src/lib/paths.ts` : métadonnées `space`, `parent`, `label` par écran.
- `src/lib/tour-steps.ts` (ancres `data-tour` des espaces renommés), `src/components/Sidebar.tsx`,
  `TopBar.tsx` (aucune logique nouvelle attendue).
- `src/app/(auth)/accounting/AccountingNav.tsx` et ses usages (supprimés).
- Tests de navigation existants (`navigation*.test.ts`, `nav-match.test.ts`,
  `navigation-subpages.test.ts`, `star-navigation.test.ts`, instantané `layout-props`).

### Approche

1. **Espaces** (ordre de la spec) : Accueil, Planning, Événements, Pastoral, Personnes, Demandes,
   Finances, Médias, Ressources, Administration, Plateforme. Rangement :
   - *Événements* : bloc *Église* (Calendrier de l'église, Gérer les événements, Service d'accueil,
     Comptes rendus, Trame des annonces) et bloc *Inscriptions* (Billetterie, Formulaires, Mes
     inscriptions). « Mes inscriptions » pointe vers `/billetterie/mes-reservations` (ou
     `/formulaires/mes-reponses` si la billetterie est coupée), avec `matchPrefixes` sur les deux ;
     une barre d'onglets (`Tabs`, mode liens) relie les deux pages. Entrée visible si la personne a
     au moins une réservation ou une réponse (deux `count` dans `loadNavigationInput`, question
     ouverte 7).
   - *Pastoral* : Mon agenda, Agenda des pasteurs (`/agenda`), Planification, Suivi pastoral
     (`/care`), Demander un rendez-vous (`/care/request`). L'espace n'apparaît que si l'une des
     trois premières entrées ou le suivi existe (sinon « Demander un rendez-vous » reste dans
     Demandes).
   - *Personnes* : STAR, Discipolat, Candidatures, bloc *Intégration* (Dossiers d'intégration,
     Bergers de famille, Parcours, Statistiques, Paramètres).
   - *Demandes* : Mes demandes, Traitement des demandes, Questionnaires. Aucune entrée comptable
     (critère « ni Demandes ni Administration n'en contiennent ») : pour le Ministre et le Resp.
     département (`accounting:view`/`accounting:submit` sans `accounting:manage`), la page Mes
     demandes gagne dès ce lot une section « Demandes comptables » (leurs demandes, dans leur portée
     actuelle, et « Nouvelle demande comptable »), qui remplace l'entrée de menu actuelle ; l'écran
     `/accounting/requests` reste ouvert et a pour parent Mes demandes pour eux. Le test
     d'invariance porte sur les écrans atteignables, entrée de menu ou lien de page.
   - *Finances* : Demandes comptables (`accounting:manage`), Statistiques (`accounting:stats`),
     Navette (`isShuttleVisible`), Trésorerie (`isTreasuryVisible`), Page de dons
     (`giving:manage`). L'équipe Navette sans autre droit n'y voit que la Navette.
   - *Ressources* : Salles, Offres (une entrée, `matchPrefixes` `/jobs` et `/admin/jobs`), Familles.
   - *Administration* : blocs *Église* (Paramètres de l'église, Ministères, Départements, Fonctions
     des départements, Configuration des salles), *Accès* (Utilisateurs, Accès & rôles, Profils
     pastoraux), *Communication* (Messages système), *Suivi* (Historique).
   - *Plateforme* (Super Admin seul) : Églises, Sauvegardes, API, Icône de l'application, Domaines
     des sites, Assistant, Assistants IA.
2. **Libellés** : tableau de la spec appliqué dans `navigation.ts`, `layout`/`navigation-input`,
   les en-têtes de page concernés (`PageHeader`) et les fils d'Ariane. Les fiches de l'assistant, le
   guide et la visite guidée sont mis à jour **au lot 4** avec les adresses, pour ne les réécrire
   qu'une fois ; au lot 1, seuls les `data-tour` qui changeraient de cible sont ajustés.
3. **Parenté** : la parenté vient du registre (`paths.ts`, champ `parent`), pas de l'heuristique
   des segments. `parentLink`/`buildBreadcrumb` remontent la chaîne de parents jusqu'à la première
   page présente dans la navigation de la personne. Écrans de l'audit (H3) : page d'un événement
   vue par un STAR → Calendrier de l'église ; `/absences` → Disponibilités ; `/care/request` →
   Mes demandes (ou Pastoral pour qui y a l'entrée) ; Mes réservations / Mes réponses → Mes
   inscriptions ; `/candidatures/ma-fiche` → Mon profil ; `/messages/[id]` → Messages système ou
   Accueil ; onglets de Finances et de Trésorerie → l'écran porteur. `fallbackParent` ne renvoie
   plus vers l'Accueil par défaut : un écran sans parent connu échoue au test d'exhaustivité.
4. **Unicité des libellés** : test sur la navigation de chaque profil de l'audit.

### Tests (Vitest)

- Réécriture de `navigation.test.ts` en **tableau rôle × espaces attendus** (profils de l'audit
  §2.1–2.3 : SA, Admin, Secrétaire, Ministre, RD, FD, Reporter, STAR, RSP, Comptable, cas d'équipe
  PVS/Navette/Captation/Média/Secrétariat/Protocole/Intégration/billetterie/campagne/formulaire).
- **Test d'invariance des droits** (critère « ensemble des écrans identique ») : pour chaque profil,
  l'ensemble des `href` internes de `buildSpaces` après le lot 1 est égal à celui d'avant, à
  l'exception de « Mes inscriptions » (même pages, entrée nouvelle). La liste « avant » est figée
  dans un fichier de référence produit sur `main` avant le lot.
- `navigation-subpages.test.ts` : chaque `page.tsx` de `(auth)` a un parent qui n'est pas l'Accueil
  par défaut (sauf pages d'espace et Accueil) ; un onglet a pour parent l'écran porteur.
- Unicité : aucun libellé de menu, d'onglet ou de fil d'Ariane ne désigne deux `href` différents
  dans la navigation d'un même profil ; globalement, seule l'exception documentée de la question
  ouverte 2 est admise.
- Plateforme absente pour l'Admin ; Administration sans aucun écran de plateforme.

### Sécurité

- **Aucune garde modifiée.** La navigation ne fait que ranger : un écran caché reste protégé par sa
  garde, un écran montré n'est pas ouvert par la navigation. Le test d'invariance des droits le
  prouve.
- « Mes inscriptions » n'agrège que les données de la personne (requêtes existantes par
  `userId`/email) ; les deux `count` ne renvoient qu'un nombre.
- Le passage de l'historique (`/admin/audit-logs`) dans Administration › *Suivi* ne change pas sa
  garde (`church:settings`).

### Recette Playwright

1. Pour chaque rôle de l'audit, ordinateur : la barre latérale montre exactement les espaces et
   blocs du tableau de la spec ; aucun espace vide.
2. Admin d'église : pas d'espace Plateforme ; Historique dans Administration › *Suivi*.
   Super Admin : Administration et Plateforme.
3. Comptable : Finances = Demandes comptables, Statistiques, Navette, Trésorerie, Page de dons.
   Ministre : pas de Finances ; section « Demandes comptables » dans Mes demandes, création
   comprise ; le chevron du détail ramène à Mes demandes.
4. Chevron mobile et fil d'Ariane : STAR ouvre un événement depuis l'Accueil puis revient ⇒
   Calendrier de l'église ; `/absences` ⇒ Disponibilités ; `/candidatures/ma-fiche` ⇒ Mon profil ;
   un onglet de Trésorerie ⇒ Trésorerie (jamais l'onglet frère) ; un message de l'administration ⇒
   Messages système (Secrétaire) ou Accueil (STAR).
5. RSP : Suivi pastoral dans Pastoral, plus dans Personnes.

### Risques

- Gros diff sur `navigation.ts` et ses tests : l'instantané du layout et le test d'invariance
  servent de filet.
- L'extraction de `loadNavigationInput` doit garder l'ordre et le nombre des requêtes (pas de
  régression de temps de rendu) : comparaison avant/après en recette.

### Retour arrière

Trivial (code seul).

---

## Lot 2 — Barre du bas, « Plus », Accueil « À traiter » (huit files) et recherche

### Fichiers touchés

- `src/lib/navigation.ts` (`ROLE_PRIORITIES`, `candidate`, `bottomDestinations`,
  `isDestinationActive`, `searchablePages`), `src/components/BottomNav.tsx`, `MoreSheet.tsx`,
  `CommandPalette.tsx`, `AuthLayoutShell.tsx`.
- `src/app/(auth)/accueil/page.tsx` et **nouveau** `src/app/(auth)/accueil/TodoBlock.tsx`.
- Compteurs : `src/modules/planning/services/` (secrétariat, retraits), `accounting/services/`,
  `care/services/`, `serving/services/`, `ticketing/services/`, `campaigns/services/`, et leurs
  index.
- Écrans qui affichent aujourd'hui un compteur recalculé en ligne (pour appeler la fonction
  partagée) : `secretariat/requests/page.tsx`, `accounting/requests/page.tsx`, `care/page.tsx`,
  `candidatures/ApplicationsClient.tsx`/`page.tsx`. Assistant : `accounting.toValidate`,
  `planning.toReplace`, `ticketing.paymentsToHandle` réalignés sur les mêmes fonctions.
- Paramètres d'ouverture : `disponibilites` (`?declarer=1`), `admin/events` (`?nouveau=1`),
  `accounting/tresorerie` (`?saisie=1`), `billetterie` (`?a-traiter=reglements`), `collectes`
  (`?a-valider=1`) et `collectes/[id]` (`?onglet=suivi&etat=soumis`).

### Barre du bas

Destinations candidates : `home`, `myPlanning`, `calendar`, `events` (espace), `planning`
(espace), `people` (espace), `requestQueue` (Traitement des demandes), `myRequests`,
`accountingRequests`, `treasury`, `shuttle`, `care` (Suivi pastoral), `reports` (Comptes rendus),
`discipleship`. Listes par rôle principal = tableau de la spec, **suivies d'une liste de repli**
commune (`myPlanning`, `calendar`, `planning`, `events`, `people`, `myRequests`) : une destination
inaccessible est remplacée par la suivante. Dédoublonnage par adresse ; jamais de formulaire (la
cible de `myRequests` est la liste, `/requests`). Une destination est active si l'écran courant est
son écran, l'un de ses descendants (chaîne de parents du registre) ou une page de son espace.

Le STAR n'a pas encore « Mes demandes » (ouvert au lot 3) : au lot 2, sa quatrième destination est
le premier repli accessible ; il l'obtient sans autre changement au lot 3.

### « Plus »

`MoreSheet` affiche les espaces accessibles avec `sidebarBlocks` (mêmes intitulés de blocs que la
barre latérale), et non plus le seul `group`.

### Recherche (⌘K)

`loadNavigationInput` calcule des **actions** à partir des mêmes droits que les écrans cibles :

| Action | Cible | Condition |
|---|---|---|
| Déclarer une absence | `/disponibilites?declarer=1` | fiche STAR liée (`hasAvailability`) |
| Nouvelle demande | `/requests/new` | `members:view` |
| Demander un rendez-vous | `/care/request?new=1` | `care` actif et `planning:view` (lot 2), tout compte de l'église (lot 3) |
| Nouvel événement | `/admin/events?nouveau=1` | `events:manage` |
| Nouvelle demande comptable | `/accounting/requests/new` | `accounting:submit` |
| Nouvelle saisie de trésorerie | `/accounting/tresorerie?saisie=1` | `isTreasuryVisible` |

Sans saisie, la palette propose d'abord les destinations de la barre du bas du rôle principal. Les
paramètres d'ouverture ne font qu'ouvrir un formulaire **déjà présent** sur l'écran ; la page lit
le paramètre dans une liste fermée et ignore toute autre valeur.

### Accueil « À traiter »

`TodoBlock` est un composant serveur rendu dans un `Suspense` (squelette `Skeleton`), après la vue
du jour. Il appelle les huit fonctions en `Promise.all`, chacune précédée de sa condition d'accès
(la moins chère d'abord : `registry.has`, permission, puis requête) et isolée par un `catch` : une
file en erreur disparaît, l'Accueil ne casse jamais. Sans file accessible, le bloc ne s'affiche pas.
Une file accessible à zéro élément s'affiche avec « 0 » (la personne sait qu'elle est à jour) —
voir question ouverte 9 si l'on préfère la masquer.

**Files qui ont un écran** (le nombre de l'Accueil est celui de l'écran ; l'écran appelle la même
fonction) :

| File | Accès | Compte | Lien |
|---|---|---|---|
| Demandes du secrétariat | `resolveRequestQueueAccess` (équipe Secrétariat, `events:manage`) | demandes ouvertes au statut `EN_ATTENTE` (`loadRequestQueue(churchId, "SECRETARIAT")`, comme `secretariat/requests/page.tsx:31-32`) | Traitement des demandes |
| Demandes comptables à valider / à payer | `accounting:manage` | à valider = `SUBMITTED` + `PROCESSING` ; à payer = échéances sans `releasedAt` ; mêmes règles que les indicateurs de `accounting/requests/page.tsx:86-98`, qui font foi | Demandes comptables |
| Justificatifs à examiner | `accounting:manage` | `countOpenJustifications` | Demandes comptables, filtre justificatifs |
| Rendez-vous et suivis à qualifier | `care:qualify` | demandes de rendez-vous et suivis non confiés, règles `isUnassignedDue` de `care/page.tsx:72-90` | Suivi pastoral |

**Files sans écran propre** (définition écrite ici, comme l'exige la spec) :

1. **Paiements de billetterie déclarés.**
   - *Accès* : au moins un événement de billetterie de l'église courante, au statut différent de
     `ARCHIVED`, sur lequel la personne peut l'action `payments` (`EVENT_ACTIONS` : Organisateur,
     Trésorier ; organisateur implicite par `ticketing:manage`).
   - *Compte* : nombre de `TicketingPayment` de genre `DECLARATION` au statut `PENDING` (« J'ai
     payé » à confirmer) sur ces événements, en **une** requête groupée par événement (pas de
     boucle `listPayments`). Les remboursements dus ne sont pas comptés : ce ne sont pas des
     paiements déclarés.
   - *Lien* : un seul événement concerné ⇒ `/billetterie/<id>?vue=reglements` (onglet existant) ;
     plusieurs ⇒ `/billetterie?a-traiter=reglements`, la liste restreinte aux événements qui en
     ont, chacun avec son nombre.
   - L'assistant `ticketing.paymentsToHandle` réutilise la même sélection d'événements.
2. **Remplacements demandés.**
   - *Accès* : `planning:edit` dans l'église courante (la Secrétaire, en lecture seule sur l'écran
     de remplacement, n'a pas de file à traiter).
   - *Compte* : `ServiceWithdrawal` au statut `PENDING`, dont l'événement n'a pas commencé
     (`event.date >= maintenant`), dans le périmètre `getUserDepartmentScope` (périmètre restreint
     vide ⇒ 0). Même règle que `planning.toReplace`, qui appelle désormais cette fonction.
   - *Lien* : la carte liste au plus cinq désistements (date, événement, département), chacun vers
     son écran `/planning/remplacements/<id>` ; le lien principal ouvre le plus proche dans le
     temps. C'est l'écran le plus proche, déjà réduit à l'élément.
3. **Questionnaires soumis à valider.**
   - *Accès* : `campaigns:manage` ou gestionnaire désigné (`campaign_managers`) d'au moins une
     campagne de l'église courante.
   - *Compte* : `CampaignAssignment` au statut `SUBMITTED` des campagnes non archivées que la
     personne gère (questionnaires confidentiels compris : un gestionnaire les lit déjà). Aucune
     valeur de réponse n'est lue.
   - *Lien* : une seule campagne concernée ⇒ `/collectes/<id>?onglet=suivi&etat=soumis` (filtre
     « Soumis » préappliqué dans `TrackingTab`) ; plusieurs ⇒ `/collectes?a-valider=1`, la liste
     restreinte aux campagnes qui en ont, chacune avec son nombre.
4. **Candidatures à traiter.**
   - *Accès* : `hasServingAccess(actor)`.
   - *Compte* : pour l'équipe Vie des STAR et l'Admin (`actor.canManage`), candidatures dont
     `bucketOf` vaut `todo` (`needsPvsAction`) — le même nombre que le compteur de l'onglet « À
     traiter » de `/candidatures`, qui appelle désormais la même fonction ; pour un responsable de
     département sans `canManage`, affectations au statut `PENDING` (à accueillir) dans ses
     départements (question ouverte 8).
   - *Lien* : `/candidatures?onglet=todo` (équipe PVS) ou `/candidatures?onglet=departments`.

### Tests (Vitest)

- `bottom-nav.test.ts` : pour chaque rôle principal, destinations = tableau de la spec ; comptes à
  plusieurs rôles dans tous les ordres ⇒ même barre ; jamais deux destinations vers la même
  adresse ; jamais un formulaire ; destination inaccessible ⇒ remplacée par la suivante ; activation
  sur un descendant (chaîne de parents).
- `more-sheet.test.ts` : mêmes blocs que `sidebarBlocks`.
- `palette-actions.test.ts` : chaque action n'apparaît qu'avec sa condition ; aucune autre action.
- Parité des compteurs, **une suite par file** : la fonction est appelée par l'écran et l'Accueil
  (test du rendu des deux avec un même jeu de données ⇒ même nombre) ; règles de chaque file
  (statuts, périmètre, événements archivés, campagne archivée, périmètre vide).
- `TodoBlock.test.tsx` : file en erreur masquée sans casser ; aucune file ⇒ pas de bloc ; liens
  (un ou plusieurs éléments).
- Pages cibles : paramètres d'ouverture inconnus ignorés.

### Sécurité

- **Aucun droit nouveau** : chaque file reprend la garde de l'écran cible ; l'Accueil n'affiche
  qu'un nombre et des libellés que l'écran montre déjà (pour les remplacements : date, événement,
  département — pas le nom du STAR ni son message).
- Les compteurs filtrent par `churchId` courant et par le périmètre de la personne (département,
  rôle d'événement, gestionnaire de campagne). Test multi-église pour chaque file.
- Paramètres d'ouverture : liste fermée, aucune redirection construite à partir d'eux.
- Performance comme sécurité de disponibilité : requêtes agrégées (`count`/`groupBy`), jamais de
  boucle par événement ; le bloc est diffusé après la vue du jour.

### Recette Playwright

1. Mobile, chaque rôle principal : barre du bas conforme au tableau ; bouton de l'écran courant ou
   de son parent allumé sur une page de détail.
2. Secrétaire : « À traiter : N demandes du secrétariat » ; second bouton ⇒ Traitement des demandes
   en un tap ; même N que l'en-tête de l'écran.
3. Comptable : files comptables et justificatifs ; mêmes nombres que l'écran.
4. Trésorier d'un événement avec deux déclarations : carte « 2 » ; lien ⇒ onglet Règlements.
   Deux événements ⇒ liste filtrée.
5. Responsable avec un désistement : carte, lien ⇒ écran de remplacement.
6. Gestionnaire de campagne : contribution soumise ⇒ carte, lien ⇒ suivi filtré « Soumis ».
7. PVS : carte = compteur de l'onglet « À traiter ».
8. « Plus » : mêmes groupes que la barre latérale (*Église*, *Accès*, *Inscriptions*, *Intégration*).
9. ⌘K sans saisie : destinations du rôle ; « nouvel » ⇒ actions autorisées seulement ; « Nouvel
   événement » ouvre le formulaire.

### Risques

- Charge de l'Accueil (page de connexion de tous) : mesurer le temps de rendu en recette ; tout
  compteur > 100 ms est revu (index existants : `[churchId, status]` sur les demandes comptables).
- Écarts de compteur entre l'écran et l'Accueil : impossibles par construction (même fonction),
  vérifiés par les tests de parité.

### Retour arrière

Trivial (code seul).

---

## Lot 3 — Vue pastorale en filtre, lecture pastorale étendue, Mes demandes et rendez-vous pour tous

### Fichiers touchés

- `src/lib/auth.ts` : `hasPastoralRead(session, churchId)` ; `PASTORAL_READ_PERMISSIONS`
  **inchangé**.
- Comptes rendus : `src/app/(auth)/admin/reports/page.tsx`,
  `src/app/(auth)/admin/events/[eventId]/report/page.tsx`, `EventReportClient` (mode `readOnly`),
  `src/app/api/events/[eventId]/report/route.ts` (GET) et son `contract.ts`.
- Comptabilité : `src/app/(auth)/accounting/requests/[id]/page.tsx` (périmètre pastoral = église),
  `src/app/api/accounting/requests/[id]/route.ts` (GET) et son `contract.ts`, composants d'action du
  détail (masqués en lecture).
- Navigation : `navigation.ts` (`buildPastoralSpaces` remplacé par un filtre), `navigation-input.ts`.
- Accueil : `accueil/page.tsx` rend le tableau pastoral (extrait de `pastoral/page.tsx` dans un
  composant partagé) en vue pastorale ; `landingHref` et `switchToPastoralMode` → `/accueil`.
- Mes demandes : `requests/page.tsx` (garde et sections), `RequestsList.tsx`, layout
  (`hasAnyNavigation`).
- Rendez-vous : `care/request/page.tsx:38`, `api/care/requests/route.ts:67` et `contract.ts`.
- `docs/openapi.json` (`npm run openapi`).

### Approche

1. **Lecture pastorale nommée.** `hasPastoralRead` n'élargit aucune permission : il est appelé
   explicitement, et seulement, sur ces chemins de lecture :
   - liste des comptes rendus (`/admin/reports`), détail d'un compte rendu
     (`/admin/events/[id]/report`) en mode lecture (`readOnly` : aucun champ éditable, aucun bouton
     d'enregistrement), `GET /api/events/[eventId]/report` ;
   - liste des demandes comptables (déjà ouverte, `isPastoral`), détail
     `/accounting/requests/[id]` et `GET /api/accounting/requests/[id]` avec le périmètre de la
     liste pastorale actuelle (toutes les demandes de l'église), sans aucune action (valider,
     payer, demander une pièce, archiver, corriger, déposer).
   - Église qui fait foi : celle de l'objet (`resolveChurchId("event", id)`, `req.churchId`), jamais
     le contexte affiché.
   - Restent fermés au pasteur : export des comptes rendus, téléchargement des pièces justificatives
     (question ouverte 4), toute route d'écriture. Les écritures sont déjà refusées par leurs gardes
     actuelles (`reports:edit`/`events:manage`, `accounting:manage`, auteur) ; le lot ajoute les tests
     qui le prouvent.
2. **Vue pastorale en filtre.** `buildSpaces` construit la navigation commune, puis, en vue
   pastorale, ne garde que : Accueil (tableau pastoral), Personnes › Mes membres
   (`/pastoral/members`) et Discipolat, Événements › Calendrier et Comptes rendus, Pastoral,
   Finances › Demandes comptables (consultation), ainsi que les écrans **personnels** du compte
   (Mon planning, Disponibilités, Audio, Mes demandes, Questionnaires, Mes inscriptions, Offres,
   Familles) et l'Administration s'il l'a (question ouverte 3). `/pastoral/events`,
   `/pastoral/reports`, `/pastoral/accounting` sortent de la navigation mais restent servis (rien
   n'est supprimé avant le lot 4, pour un retour arrière simple).
3. **Mes demandes pour tous** (exception 1).
   - Garde de `/requests` : session + église courante + `requireChurchAccess(churchId)` (rôle ou
     profil pastoral). Les gardes de `/requests/new`, `/requests/[id]/edit`, `GET/POST/PATCH
     /api/requests` sont **inchangées** (`members:view`, `planning:edit`) : créer ou modifier une
     demande interne reste réservé.
   - Sections, chacune masquée si vide ou sans objet : demandes internes déposées (lecture par
     `submittedById`, bouton « Nouvelle demande » seulement avec `members:view`) ; demandes de
     rendez-vous pastoral (les siennes) avec « Demander un rendez-vous » ; questionnaires à remplir ;
     rappel des inscriptions (nombre et lien vers Mes inscriptions) ; demandes comptables (section
     déjà ajoutée au lot 1) ; lien Navette pour l'équipe Navette. Chaque section appelle son module par l'index, sous
     `registry.has`.
   - L'entrée « Mes demandes » est ajoutée **après** le calcul de `hasAnyNavigation`, qui ne la
     compte pas : `/no-access` (spec 038, CA10) reste atteignable pour un compte sans autre accès.
4. **Rendez-vous pour tous** (exception 2) : `requireChurchAccess(churchId)` remplace
   `requireChurchPermission("planning:view", churchId)` sur la page et l'API. Le débit est limité
   par compte (`src/lib/rate-limit.ts`, 5 demandes par heure) si la route ne l'est pas déjà.

### Tests (Vitest)

- Lecture pastorale : pasteur sans rôle ⇒ `/admin/reports` et le détail s'ouvrent en lecture
  (aucun bouton d'action rendu) ; `GET` du compte rendu et de la demande comptable ⇒ 200 dans son
  église, 404/403 dans une autre église ; `PUT /api/events/[id]/report`, `PATCH
  /api/accounting/requests/[id]`, `POST /api/accounting/requests`, dépôt de pièce, export des
  comptes rendus ⇒ refusés. Un profil pastoral n'ouvre rien dans une église où il n'en a pas.
- Non-régression : `PASTORAL_READ_PERMISSIONS` inchangé (test figé) ; `rolePermissions` inchangé
  (`permissions.test.ts`).
- Mes demandes : STAR, FD, Reporter, Comptable, RSP, pasteur sans rôle ouvrent la page ; aucun bouton
  « Nouvelle demande » sans `members:view` ; `POST /api/requests` sans `members:view` ⇒ 403 ; un
  compte sans rôle ni profil ⇒ `/no-access`.
- Rendez-vous : un Reporter dépose une demande (201) ; un compte d'une autre église ⇒ 403 ; débit.
- Vue pastorale : « Mes membres » même adresse partout ; pasteur aussi STAR garde Planning et
  Audio ; retour à la vue normale ⇒ même structure d'espaces.

### Sécurité

- **Changement d'autorisation, borné et nommé** : seules les trois exceptions de la spec. La
  lecture pastorale ne passe jamais par `requireChurchPermission`, pour qu'elle ne s'étende pas en
  silence aux autres appelants de `reports:view`/`accounting:view` (exports, assistant, MCP
  `reports.recent`/`reports.get`, `accounting/series`, justificatifs). L'assistant et le serveur
  MCP ne changent pas (leur `viewer` ne lit que `rolePermissions`).
- **Lecture seule appliquée côté serveur** : l'absence de bouton est un confort ; chaque écriture
  reste refusée par sa garde, ce que les tests vérifient route par route.
- **Exposition de données** : le détail d'une demande comptable montre au pasteur plus que la liste
  pastorale actuelle (description, échéances, motif de rejet). C'est l'objet de l'exception 3 ; le
  détail en lecture pastorale ne montre ni l'email du demandeur ni aucune coordonnée bancaire, et
  ne permet pas de télécharger les pièces (question ouverte 4).
- **Mes demandes** : toutes les lectures sont filtrées par `userId` ou `submittedById` et par
  `churchId` courant ; aucune liste d'autrui.
- **Rendez-vous ouvert** : surface d'abus (dépôts en masse) contenue par le débit et par le fait que
  seuls des comptes de l'église y accèdent.

### Recette Playwright

1. Pasteur sans rôle, vue pastorale : espaces = Accueil (tableau pastoral), Personnes, Événements,
   Pastoral, Finances ; un compte rendu et une demande comptable s'ouvrent sans aucun bouton ;
   tentative de `PUT` par la console ⇒ refus.
2. Pasteur aussi STAR : Planning et Audio visibles ; bascule vers la vue normale ⇒ mêmes espaces.
3. STAR : barre du bas Accueil · Mon planning · Calendrier de l'église · Mes demandes ; Mes demandes
   liste rendez-vous, questionnaires, inscriptions, et propose « Demander un rendez-vous » ; aucun
   bouton « Nouvelle demande ».
4. Reporter et Comptable : déposent une demande de rendez-vous.
5. Ministre : depuis Mes demandes, crée une demande comptable et voit celles de son ministère.
6. Membre Navette sans droit comptable : Finances = Navette ; Mes demandes y renvoie.
7. Compte sans aucun accès : `/no-access`.

### Risques

- Mode lecture d'`EventReportClient` : régression possible de la saisie ; tests du composant dans
  les deux modes.
- Confusion entre « lecture pastorale » et permission : contenue par un helper unique et un test qui
  échoue si `PASTORAL_READ_PERMISSIONS` change.

### Retour arrière

Simple : code seul ; les écrans pastoraux en double sont encore servis.

---

## Lot 4 — Bascule des adresses

### Fichiers touchés

- `git mv` des dossiers de `src/app/(auth)/` selon la carte (layouts `audio`, `communication`,
  `media`, `media/(visuels)` déplacés **avec** leurs pages) ; nouvelles pages noyau : redirecteurs
  `/finances`, `/personnes`, `/pastoral` (remplace le tableau pastoral), `/ressources`,
  `/plateforme`, et `/evenements/mes-inscriptions`.
- `src/lib/paths.ts` (nouvelles valeurs), `src/lib/module-routes.ts` (`NOYAU_ROUTES`), `routes`
  des manifestes (65 littéraux).
- **Nouveau** `src/lib/legacy-paths.ts` (table des anciennes adresses), `src/proxy.ts` (appel après
  la branche des hôtes de site), `next.config.ts` (redirections existantes retirées, reprises dans
  la table avec leur cible finale).
- `redirect("/admin")` des pages Super Admin → `/plateforme` (9 occurrences).
- **Nouveau** `scripts/092-rewrite-stored-paths.ts` ; `docs/production.md` (étape de déploiement).
- `public/sw.js` (cache `koinonia-v7`, réponses redirigées jamais mises en cache).
- Contenus : `src/components/GuideContent.tsx`, `src/modules/assistant/knowledge/*.ts` (`href`,
  `hrefLabel`, fils en toutes lettres), `src/lib/tour-steps.ts`, `docs/` (CLAUDE.md, `auth.md`,
  `architecture.md`, `database.md`, `production.md`, `design-system/guidelines/10-navigation.md`,
  `guide-screenshots.md`, ADR-0019/0023/0031 pour les chemins cités). Les `specs/` passées ne sont
  pas réécrites.
- Tests : 57 fichiers de tests à littéraux, instantanés `layout-props` et `accueil`.

### Approche

1. **Déplacement** : écran par écran selon la carte, avec mise à jour du registre ; `typecheck`
   détecte les imports relatifs cassés (`accueil` → `planning`, `requests`).
2. **Propriété des préfixes** : chaque manifeste déclare ses nouveaux préfixes ; plusieurs modules
   partagent un préfixe d'espace (`/finances/navette` à `shuttle`, `/finances` à rien — redirecteur
   noyau exact, `/finances/demandes` à `accounting`). Le correctif du lot 0 garantit qu'un module
   coupé répond 404 sous un préfixe partagé.
3. **Table des anciennes adresses** (`legacy-paths.ts`, pure) : entrées `{ from, to, status }` à
   segments fixes et paramètres nommés (`/accounting/requests/:id` → `/finances/demandes/:id`).
   `matchLegacyPath(pathname)` :
   - ne connaît aucun joker ; un paramètre ne correspond qu'à `[A-Za-z0-9_-]{1,64}` ;
   - construit la cible par substitution dans un modèle qui commence par un segment littéral ;
   - n'est consulté que pour `GET` et `HEAD`.
4. **Place dans le proxy** : après `siteHostRoute` (jamais sur un hôte de site), après le test des
   fichiers statiques et de `/site`, avant le contrôle de module de l'ancienne adresse. Si la cible
   résout `orphan` (module coupé), le proxy répond comme un module absent **à l'ancienne adresse**,
   sans redirection. Sinon, réponse `307` vers `nextUrl.clone()` dont seul `pathname` change (même
   origine, chaîne de requête conservée). Une ligne de journal par redirection donne le **motif**
   source, jamais l'identifiant ni la requête (mesure de l'usage pendant l'observation).
5. **Anciennes adresses inconnues** : un ancien préfixe qui n'est plus déclaré résout `orphan` ⇒
   404 ordinaire, sans boucle.
6. **Méthodes autres que GET/HEAD** sur une ancienne adresse de page : pas de redirection (un 307
   rejouerait le corps vers une autre cible) ; la requête suit le chemin normal et reçoit 404.
   Les adresses `/api/*` ne bougent pas.
7. **Adresses mémorisées** : `scripts/092-rewrite-stored-paths.ts` (tsx), avec les modes
   `--dry-run` (défaut : nombres et échantillons), `--apply` et `--reverse`.
   - Il lit la même table (`legacy-paths.ts`, plus une table de **préfixes** pour
     `AssistantEntry.screens`, qui contient des préfixes et non des adresses).
   - Il réécrit `AssistantEntry.href`, `AssistantEntry.screens`, `SystemMessage.linkUrl` (relatif,
     ou absolu vers l'origine de l'application seulement) et `Notification.link`.
   - Il est **idempotent** (aucune nouvelle adresse n'est une ancienne source : testé) et **non
     destructif** : avant `--apply`, il écrit dans le répertoire des sauvegardes un fichier JSON
     `(table, id, ancienne valeur)` ; il travaille par lots de 500 en transaction. `--reverse`
     restaure par la table inverse. Les textes libres (`AssistantEntry.answer`) ne sont pas
     modifiés : le mode `--dry-run` liste les fiches qui citent un ancien chemin, pour relecture par
     le Super Admin.
   - Exécution : en recette d'abord, puis en production juste après le déploiement, comme étape
     manuelle du runbook (question ouverte 12).
8. **Liens par objet (ADR-0019)** : les effacements qui retrouvent des notifications par leur lien
   (`notifications.ts:184`, `care/services/followups.ts:417`, `care/services/relances.ts:194`,
   `integration/services/family-service.ts:248`) cherchent l'ancienne **et** la nouvelle forme
   (`legacyAndCurrent(path)`), pour couvrir l'intervalle entre le déploiement et le script.
9. **Service worker** (ADR-0026) : `CACHE_NAME = "koinonia-v7"` (l'ancien cache est purgé à
   l'activation) ; une réponse `redirected` n'est jamais mise en cache (une réponse redirigée servie
   depuis le cache pour une navigation échoue). Les données IndexedDB des écrans hors ligne ne
   dépendent pas de l'adresse.
10. **Fenêtre de bascule** : jamais pendant un événement de billetterie en cours ni dans les 24 h
    qui précèdent son ouverture (`TicketingEvent` `OPEN` dont les dates chevauchent) ; prévenir les
    organisateurs de rouvrir une fois en ligne les écrans de contrôle et de restauration.
11. **Version de secours** : une branche `rollback/092-lot4`, tirée du dernier état avant la
    bascule, ajoute au proxy la **table inverse** (nouvelle → ancienne, 307). Elle est construite et
    recettée avant la mise en production. Avec `--reverse`, elle remet les anciennes adresses sans
    casser les liens émis entre-temps.

### Tests (Vitest)

- `legacy-paths.test.ts` : **liste complète** de la carte (chaque ancienne adresse d'écran, avec
  identifiant et paramètres, redirige vers la nouvelle) ; aucune chaîne (aucune cible n'est une
  source) ; aucune source n'est préfixe d'une route publique (`isPublicRoute`), d'un chemin de
  `SITE_HOST_PASSTHROUGH`, ni de `/media/c|d|g|v` ; aucun joker ; paramètre invalide
  (`..`, `%2F`, `//`, `\`) ⇒ pas de correspondance ; toute cible correspond à une page
  (`paths.test.ts`).
- `proxy-legacy.test.ts` : `GET` ⇒ 307 avec la requête conservée ; `POST` ⇒ pas de redirection ;
  hôte de site ⇒ jamais de redirection (`/billetterie` d'un site reste sa page) ; cible d'un module
  coupé ⇒ 404 à l'ancienne adresse ; ancienne adresse inconnue ⇒ 404 ; sans session ⇒ 307 puis
  connexion.
- Instantané `site-render.test.ts.snap` **inchangé** (garde-fou des sites d'événement).
- `rewrite-stored-paths.test.ts` : réécriture et inverse sur un jeu en mémoire ; idempotence (deux
  passages = un passage) ; préfixes de `screens` ; adresse absolue d'une autre origine intacte.
- `knowledge.test.ts` : chaque `href` des fiches résout une page ; `SCREEN_PERMISSION` réindexé ;
  l'aide contextuelle s'affiche sur les mêmes écrans qu'avant (table ancienne → nouvelle des
  `screens`).
- Exhaustivité des routes, des écrans, cliquet des littéraux, instantanés mis à jour.
- Toutes les adresses d'écran commencent par le préfixe de leur espace (test sur le registre),
  hors liste d'exceptions.

### Sécurité

- **Redirection ouverte** : impossible par construction — cible issue d'un modèle fixe commençant
  par un segment littéral, paramètres limités à `[A-Za-z0-9_-]`, origine reprise de la requête
  (`nextUrl.clone()`), jamais d'hôte ni de schéma lus dans l'adresse. Tests des formes `//x`,
  `/\x`, `%2F`, `%5C`.
- **Hôtes de site** (ADR-0031) : la branche des hôtes de site s'exécute avant toute redirection ;
  aucune redirection ne peut atteindre un site d'événement ni un domaine dédié.
- **Liens publics et jetons** : sources énumérées, aucune sous `/media/c|d|g|v`, `/f`, `/billet`,
  `/reservation`, `/collecte`… (test).
- **Modules coupés** : 404 à l'ancienne comme à la nouvelle adresse, sans révéler la cible.
- **Méthodes** : seules `GET`/`HEAD` sont redirigées ; aucune requête porteuse d'un corps (server
  action, formulaire) n'est rejouée vers une autre adresse. Les server actions restent protégées par
  la vérification d'origine de Next.js.
- **Gardes déplacées** : chaque `page.tsx` qui quitte `/admin` perd le seul `requireChurchAccess`
  du layout admin ; une liste de contrôle page par page et un test exigent une garde explicite
  (`require*`) dans chaque page déplacée.
- **Script de données** : aucune donnée n'est supprimée, sauvegarde avant écriture, réversible ;
  exécuté par l'exploitation, jamais par la CI.
- **Pas de nouvelle donnée exposée** : les journaux de redirection ne contiennent ni identifiant ni
  requête.

### Recette Playwright

1. Secrétaire (scénario principal de la spec) : Accueil ⇒ Traitement des demandes ⇒ une demande,
   chevron « Traitement des demandes », adresse en `/demandes/` ; un ancien lien de notification
   ouvre le même écran à sa nouvelle adresse ; « Plus » groupé.
2. Pour chaque ligne de `url-mapping.txt` : l'ancienne adresse (avec un identifiant réel et une
   requête `?x=1`) répond 307 vers la nouvelle, qui s'affiche.
3. Hôte de site de recette : `/billetterie` et `/accueil` du site s'affichent (aucune redirection) ;
   `/media/g/<jeton>` s'ouvre.
4. Instance sans `shuttle` : `/accounting/navette` et `/finances/navette` ⇒ 404.
5. Ancienne adresse inconnue (`/accounting/inexistant`) ⇒ 404 sans boucle.
6. Écrans hors ligne : ouvrir le contrôle d'entrée en ligne, passer en mode avion, recharger,
   scanner, revenir en ligne ⇒ synchronisation.
7. Aide contextuelle de l'assistant : même fiche sur les mêmes écrans qu'avant ; un message système
   à lien interne mène à la nouvelle adresse.
8. Visite guidée de chaque rôle : aucune étape ne vise un élément absent.
9. Version de secours en recette : les nouvelles adresses redirigent vers les anciennes.

### Risques

- **Liens hors application** (emails envoyés, WhatsApp, favoris) : ils ne tiennent que par les
  redirections, conservées sans échéance.
- **Volume** : 122 écrans ; le registre et les tests de table limitent le risque d'oubli.
- **Cache des navigateurs** : 307 non mis en cache durablement ; la version de secours reste
  possible.
- **Intervalle déploiement → script** : la cloche montre d'anciens liens, qui redirigent ; les
  effacements ADR-0019 cherchent les deux formes.

### Retour arrière

Version de secours `rollback/092-lot4` (table inverse) + `scripts/092-rewrite-stored-paths.ts
--reverse`, possibles pendant toute l'observation.

---

## Lot 5 — Redirections permanentes

### Fichiers touchés

`src/lib/legacy-paths.ts` (statut 308), `legacy-paths.test.ts`, `proxy-legacy.test.ts`,
suppression de `legacyAndCurrent` (les liens stockés sont tous réécrits), suppression de la branche
de secours, ADR-0033 (statut et date du passage).

### Approche

Après deux à quatre semaines sans anomalie (journaux de redirection sans pic de 404, aucun retour
utilisateur bloquant), le statut passe à 308 pour toute la table. Les entrées déjà permanentes
(ex-`next.config.ts`) le restent. La table n'a pas d'échéance.

### Tests

Toutes les entrées en 308 ; mêmes invariants qu'au lot 4.

### Sécurité

Mêmes garanties qu'au lot 4 ; le 308 est mis en cache sans limite par les navigateurs, d'où la
vérification préalable de la table complète en recette.

### Recette Playwright

Échantillon d'anciennes adresses ⇒ 308 vers la nouvelle ; hôtes de site et liens publics intacts.

### Risques et retour arrière

Non réversible côté navigateurs (308 en cache) : c'est pourquoi il est séparé et différé.

---

## Décisions & alternatives écartées

- **Choix** : redirections dans le proxy, après les hôtes de site — *Pourquoi* : `next.config`
  s'applique avant le proxy et donc aussi aux sites d'événement (page « billetterie » par défaut
  cassée). **Écarté** : `next.config` avec condition `missing host` — les domaines dédiés sont
  dynamiques.
- **Choix** : table explicite à segments fixes — **Écarté** : jokers (`/media/:path*` casserait les
  liens de partage publics).
- **Choix** : 307 puis 308 — **Écarté** : 308 dès la bascule (retour arrière impossible côté
  navigateurs).
- **Choix** : lecture pastorale par un helper nommé — **Écarté** : ajouter `reports:view` et
  `accounting:view` à `PASTORAL_READ_PERMISSIONS` — étendrait en silence l'export, les séries
  comptables, les justificatifs et tout futur appelant de `requireChurchPermission`.
- **Choix** : réécriture des adresses mémorisées par script idempotent et réversible —
  **Écarté** : migration SQL `REPLACE` — non réversible proprement, fragile sur les préfixes JSON de
  `screens`, et rejouée sans objet par la CI sur une base vierge.
- **Choix** : registre des écrans au lot 0 — **Écarté** : remplacement des littéraux au moment de
  la bascule — tout dans une seule PR à haut risque.
- **Choix** : racines d'espace en redirecteurs noyau — **Écarté** : pages d'accueil d'espace —
  une page de plus à maintenir par espace, sans besoin dans la spec.
- **Choix** : « Mes inscriptions » en page noyau au lot 4 (deux onglets, modules par leur index) ;
  entrée commune sur deux pages aux lots 1 à 3 — **Écarté** : fusion dès le lot 1, qui changerait
  une adresse.
- **Choix** : écrans pastoraux en double conservés jusqu'au lot 4 — rend le lot 3 réversible.
- **Choix** : suppression d'`AccountingNav` — ses onglets répétaient le menu (principe 6).

## Risques & points d'attention (transverses)

1. Sites d'événement et liens publics touchés par une redirection — fermé par la place dans le
   proxy et les tests de table (lot 4).
2. Modules coupés servis sous un préfixe parent — fermé au lot 0.
3. Aide contextuelle de l'assistant perdue sans erreur visible — script obligatoire et test des
   `screens` (lot 4).
4. Lecture pastorale qui fuirait vers d'autres appelants — helper nommé, tests figés (lot 3).
5. Charge de l'Accueil — compteurs agrégés, `Suspense` (lot 2).
6. Écrans hors ligne pendant un événement — fenêtre de bascule, cache v7 (lot 4).

## Stratégie de tests

Vitest à chaque lot (détail par lot ci-dessus) ; filets transverses : exhaustivité des routes et
des écrans, cliquet des littéraux, invariance des droits par profil, parité des compteurs, table
complète des redirections, instantané des sites d'événement inchangé. Avant chaque PR :
`npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`, plus `npm run
build` (frontière client/serveur) et `npm run openapi` quand un contrat change. La recette
Playwright de chaque lot se fait sur le conteneur de développement (`AUTH_DEV_LOGIN`, jeu fictif)
puis en recette ; le dépôt n'a pas de suite Playwright en CI et ce plan n'en ajoute pas
(question ouverte 13).

## Questions ouvertes

Rien dans la spec n'est bloquant ; les points suivants demandent un arbitrage du propriétaire. Le
plan applique la valeur recommandée tant qu'elle n'est pas contredite.

1. **Adresse des demandes comptables pour le Ministre et le Resp. département.** La spec les fait
   passer par Mes demandes, alors que l'écran (liste et détail) appartient à Finances ; un écran n'a
   qu'une adresse. *Défaut* : adresse canonique `/finances/demandes…` pour tous ; pour ces rôles,
   le parent (chevron, fil d'Ariane) est Mes demandes, sans espace Finances. Exception au principe
   « adresse = préfixe de l'espace de la personne », documentée dans ADR-0033.
2. **« Calendrier de l'église » désigne deux écrans** (vue hebdomadaire du STAR `/planning/events`,
   liste `/events`), ce qui contredit le critère d'unicité des libellés. *Défaut* : au lot 4, une
   seule adresse `/evenements` qui affiche l'une ou l'autre vue selon le droit (`events:view` ou
   `planning:view`) ; d'ici là, l'exception est tolérée par le test (audiences disjointes).
3. **Vue pastorale d'un compte qui a aussi un rôle d'administration.** La spec dit « mêmes espaces,
   limités à la lecture pastorale » et « il garde ses propres écrans ». *Défaut* : lecture pastorale
   + écrans personnels + Administration s'il l'a (comme aujourd'hui) ; les écrans de gestion des
   autres espaces (Gérer les événements, Traitement des demandes…) sont masqués en vue pastorale.
4. **Pièces justificatives et export en lecture pastorale.** *Défaut* : ni téléchargement des
   pièces, ni export des comptes rendus (pas d'exposition hors de l'écran).
5. **Périmètre de la lecture pastorale comptable.** L'écran pastoral actuel montre l'année en
   cours, la liste commune (`isPastoral`) toute l'église. *Défaut* : toute l'église, comme la liste
   commune ; filtre d'année laissé à l'écran.
6. **Rôle Secrétaire virtuel dans la priorité du rôle principal.** *Défaut* : il compte (il porte
   les mêmes droits, dont la file du secrétariat).
7. **Visibilité de l'entrée « Mes inscriptions ».** *Défaut* : seulement si la personne a au moins
   une réservation ou une réponse ; sinon accessible par Mes demandes.
8. **File « Candidatures à traiter » d'un responsable de département.** *Défaut* : affectations
   `PENDING` de ses départements.
9. **File à zéro dans « À traiter ».** *Défaut* : affichée avec 0 ; alternative : masquée.
10. **File des remplacements pour la Secrétaire** (lecture seule sur l'écran). *Défaut* : pas de
    file (`planning:edit` requis).
11. **Église par défaut non déterministe** (`getCurrentChurchId`, `churchRoles[0]`) : même défaut
    que le rôle principal, hors spec. *Défaut* : correctif séparé, hors de cette feature.
12. **Exécution du script de réécriture.** *Défaut* : étape manuelle du runbook, juste après le
    déploiement, recette puis production ; jamais dans la CI ni dans `migrate deploy`.
13. **Recette Playwright** : *défaut* : scénarios exécutés à chaque lot, résultats joints à la PR ;
    pas de suite Playwright ajoutée à la CI (hors périmètre).
