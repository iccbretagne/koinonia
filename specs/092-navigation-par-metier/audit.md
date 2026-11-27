# Audit de la navigation Koinonia (web, mobile, PWA)

Base : `main` @ 20f3024b, lecture seule. Carte par rôle **calculée** avec `buildSpaces` /
`bottomDestinations` / `sidebarBlocks` / `searchablePages` réels (script vitest jetable :
`scratchpad/navmap/map.test.ts`, sortie brute `scratchpad/navmap/map.md` ; sondes d'URL :
`scratchpad/navmap/probe.txt`). Les entrées du script reproduisent `(auth)/layout.tsx` à partir
de `rolePermissions` (hypothèses en §2.0).

---

## 0. Synthèse

1. **L'architecture technique est saine** : une seule définition (`src/lib/navigation.ts`)
   alimente sidebar, rail, barre du bas, « Plus », fil d'Ariane, chevron et palette. Ce qui
   cloche, c'est **le rangement et les libellés**, et une couche de navigation secondaire
   (onglets de page, accueils à cartes, vue pastorale) qui n'est pas modélisée par cette
   définition unique.
2. **Le rangement suit l'historique des specs, pas les métiers** : Finances (comptabilité,
   navette, trésorerie, dons) éclatées entre « Demandes » et « Administration » ; gestion
   d'événements sous « Agenda » au milieu de l'agenda pastoral ; « Questionnaires » sous
   « Demandes » ; Administration mélange église et plateforme.
3. **Les libellés se répètent** : « Demandes » désigne 5 choses, « Agenda » 5, « Salles » 2,
   « Collectes » 2 sens, « Disponibilités » 2 pages.
4. **Mobile** : la barre du bas est mal servie pour plusieurs rôles (STAR : « Demandes » ouvre
   directement un formulaire de RDV pastoral ; Comptable et Référent soins pastoraux : 2
   destinations ; Secrétaire : « Demandes » n'ouvre pas sa file) ; le panneau « Plus » perd les
   blocs de la sidebar (Administration à plat sur 12-17 lignes).
5. **Pages hors espace** : une dizaine d'écrans réels n'allument aucune entrée et renvoient
   le chevron vers « Accueil » (dont la page d'un événement pour un STAR, `/absences`, le RDV
   pastoral, « Mes réservations », « Mes réponses », « Ma fiche »).
6. **Vue pastorale** : seconde navigation complète, avec son propre accueil et un bug de
   destination (« Mes membres » de la barre du bas ≠ « Mes membres » de la sidebar).

Proposition : 10 espaces stables (dont **Finances** et **Plateforme** nouveaux, « Agenda »
renommé **Événements**, agenda pastoral regroupé avec le suivi), en 5 lots dont les deux premiers
ne changent aucune URL.

---

## 1. Comment la navigation est construite aujourd'hui

| Couche | Fichier | Rôle |
|---|---|---|
| Droits → sections | `src/app/(auth)/layout.tsx` | calcule `configLinks`, `requestLinks`, `mediaLinks`, `agendaLinks`, `integrationLinks`, `servingLinks` et ~20 booléens `has*` (l.22-46, 236-274, 505-579) |
| Sections → espaces | `src/lib/navigation.ts` `buildSpaces` (l.384-415) | 8 espaces fixes : Accueil, Planning, Agenda, Personnes, Demandes, Médias, Ressources, Administration ; 2 sections de sidebar « Mon service » / « Église » |
| Desktop | `Sidebar.tsx` + `sidebarBlocks` (l.469-501) | 1 espace ouvert à la fois, blocs (`sidebarBlock`) : Départements, Église, Inscriptions, Agenda pastoral, Intégration, Comptabilité, Organisation, Accès, Finances, Plateforme |
| Tablette | `Sidebar.tsx` `RailNav` | rail 72px + panneau flottant |
| Mobile | `BottomNav.tsx` + `bottomDestinations` (l.794-871) ; `MoreSheet.tsx` | 4 destinations max par **rôle principal** + « Plus » (2 niveaux, groupement par `group` seulement) |
| Retour | `TopBar.tsx` l.150 + `parentLink`/`fallbackParent` (l.741-775) | desktop : fil d'Ariane ; mobile : chevron vers le parent arborescent |
| Recherche | `CommandPalette.tsx` + `searchablePages` (l.892-915) | pages du rôle + compte + STAR (`/api/members`) + événements (`/api/events`) |
| 2e niveau (hors définition unique) | `AccountingNav.tsx` l.25-29, `AvailabilityTabs.tsx` l.20-22, `DashboardActions.tsx` l.7-48, `buildVisualsTabs` (`media-space.ts` l.60), `audio/tabs.ts`, `SpaceHome` (`/media`, `/audio`), ~20 `<Tabs>` de page | onglets et accueils à cartes |
| Vue pastorale | `buildPastoralSpaces` (l.255-278), `/pastoral/*` | navigation parallèle, cookie `koinonia-view-mode` |
| Mort | `navigation:` dans 9 manifestes (`src/modules/*/manifest.ts`, ex. planning l.105-110) | jamais lu ; contient `/announcements`, qui n'existe plus |

142 `page.tsx` sous `(auth)`.

---

## 2. Carte réelle par rôle

### 2.0 Hypothèses du calcul
- Tous les modules actifs ; église type à 6 départements / 5 ministères.
- « Fiche liée » (compte relié à une fiche STAR) pour tous les rôles sauf mention : c'est ce qui
  ouvre « Mon planning » (avec `planning:view`) et « Disponibilités » (sans condition de rôle,
  `layout.tsx` l.578).
- Trame des annonces approchée (vraie pour SA/Admin/Sec/Min/RD ; fausse pour STAR non déposant).
- `famillesUrl` est **toujours** renseigné (`layout.tsx` l.505, valeur par défaut), donc
  « Familles » (lien externe) apparaît pour **tous** les rôles (`navigation.ts` l.341).
- Barre du bas : calculée sur le **premier** rôle de l'église courante (`layout.tsx` l.582), sans
  ordre défini (`loadChurchRoles`, `src/lib/auth.ts` l.198-211, aucun `orderBy`).

### 2.1 Rôles

Notation : `Espace → destination : pages` (`[Bloc]` = intitulé de la sidebar desktop).

**Super Admin** : 8 espaces, **54 entrées**, palette 58
- Barre du bas : Accueil · Agenda(`/events`) · Demandes(`/requests`) · Personnes(`/admin/members`) · Plus
- Planning → `/dashboard` : Mon planning, Disponibilités | [Départements 6] par ministère
- Agenda → `/events` : [Église] Agenda de l'église, Gérer les événements, Service d'accueil, Comptes rendus, Trame des annonces | [Inscriptions] Billetterie, Formulaires | [Agenda pastoral] Vue agenda, Planification
- Personnes → `/admin/members` : STAR, Discipolat, Candidatures | [Intégration] Demandes, Bergers de famille, Parcours, Statistiques, Paramètres | Suivi pastoral, Familles
- Demandes → `/requests` : Mes demandes, Traitement des demandes, Questionnaires | [Comptabilité] Demandes, Navette, Trésorerie
- Médias → `/media` : Communication & Production, Audio
- Ressources → `/rooms` : Salles, Offres
- Administration → `/admin/churches` : [Organisation] Églises, Ministères, Départements, Fonctions dép., Salles, Messages système | [Accès] Utilisateurs, Accès & rôles, Profils pastoraux | [Finances] Page de dons | [Plateforme] Historique, Sauvegardes, API, Icône de l'application, Domaines des sites | *(sans intitulé)* Assistant, Assistants IA (MCP)

**Admin** : 8 espaces, **48 entrées** : comme Super Admin, sauf Administration → `/admin/churches/<id>` : [Organisation] Paramètres de l'église, Ministères, Départements, Fonctions dép., Salles, Messages système | [Accès] Utilisateurs, Accès & rôles, Profils pastoraux | [Finances] Page de dons | [Plateforme] **Historique** (seule entrée)

**Secrétaire** : 8 espaces, 36 entrées. Barre du bas comme Admin.
- Personnes : STAR, Discipolat | [Intégration] 5 | Suivi pastoral, Familles
- Demandes → `/requests` : Mes demandes, Traitement des demandes (pas Questionnaires ni Comptabilité)
- Administration → **`/admin/departments/functions`** : Fonctions dép., Messages système, Accès & rôles, Page de dons
- (Si la Secrétaire l'est par appartenance au département Secrétariat, le rôle est virtuel et ajouté **en dernier**, `auth.ts` l.330-350 : sa barre du bas suit son autre rôle.)

**Ministre** (2 départements) : 8 espaces, 17 entrées
- Barre du bas : Accueil · Planning(`/dashboard`) · Agenda(`/events`) · Personnes(`/admin/members`) · Plus
- Planning : Mon planning, Disponibilités | [Départements · Louange 2] ; Agenda : Agenda de l'église, Trame des annonces ; Personnes : STAR, Discipolat, Familles ; Demandes : Mes demandes, Comptabilité ; Médias : Audio ; Ressources : Salles, Offres ; Administration → `/admin/ministries` : Ministères, Départements, Accès & rôles

**Resp. département** (1 département) : 7 espaces, 13 entrées : comme Ministre sans Administration.

**Faiseur de disciples** : 5 espaces, 5 entrées
- Barre du bas : Accueil · **Planning(`/disponibilites`)** · Personnes(`/admin/discipleship`) · Plus
- Planning : Disponibilités seule (pas de `planning:view`) ; Personnes : Discipolat, Familles ; Médias : Audio ; Ressources : Offres. **Ni « Mes demandes » ni RDV pastoral.**

**Reporter** : 6 espaces, 6 entrées
- Barre du bas : Accueil · Planning(`/disponibilites`) · Agenda(`/events`) · Plus
- Agenda : Agenda de l'église, Comptes rendus ; **Personnes → lien externe Familles seul** ; Médias : Audio ; Ressources : Offres. Ni demandes ni RDV pastoral.

**STAR** : 7 espaces, 7 entrées
- Barre du bas : Accueil · Mon planning · Agenda(`/planning/events`) · **Demandes(`/agenda/request` = formulaire de RDV pastoral)** · Plus
- Planning : Mon planning, Disponibilités ; Agenda : Agenda de l'église ; **Personnes → Familles (externe) seul** ; Demandes : Demande RDV pastoral ; Médias : Audio ; Ressources : Offres

**Référent soins pastoraux** : 5 espaces, 5 entrées
- Barre du bas : Accueil · Suivi(`/care`) · Plus (**2 destinations** : « Personnes » écartée car même URL que « Suivi », pas d'Agenda)
- Planning : Disponibilités ; Personnes : Suivi pastoral, Familles ; Médias : Audio ; Ressources : Offres

**Comptable** : 7 espaces, 8 entrées (6 sans fiche liée)
- Barre du bas : Accueil · Comptabilité · Plus (**2 destinations** ; « Demandes » écartée, même URL)
- Planning : Disponibilités (si fiche liée) ; Personnes : Familles (externe) ; Demandes → `/accounting/requests` : Comptabilité, Navette, Trésorerie ; Médias : Audio ; Ressources : Offres ; **Administration → `/dons` : Page de dons (seule entrée)**

### 2.2 Cas d'équipe (rôle STAR + donnée)

| Cas | Ce qui s'ajoute | Où |
|---|---|---|
| PVS (Vie des STAR) | Candidatures | Personnes (avec Familles) |
| Navette | Navette | Demandes, bloc [Comptabilité] avec RDV pastoral |
| Captation audio | rien dans la navigation ; l'onglet Production apparaît dans `/audio` | Médias › Audio (accueil à cartes) |
| Production Média / Photos / Communication | Communication & Production | Médias |
| Secrétariat | Traitement des demandes (et rôle Secrétaire virtuel) | Demandes, qui mène alors à `/secretariat/requests` |
| Protocole | Vue agenda, Planification | Agenda › [Agenda pastoral] |
| Intégration / MSDP | Intégration, Bergers, Parcours, Statistiques | Personnes › [Intégration] |
| Rôle d'événement billetterie | Billetterie | Agenda › [Inscriptions] |
| Gestionnaire / répondant de campagne | Questionnaires | Demandes |
| Intervenant de formulaire / accès délégué | Formulaires | Agenda › [Inscriptions] |

### 2.3 Vue pastorale

| Cas | Barre du bas | Espaces |
|---|---|---|
| Admin + profil pastoral | Accueil(`/pastoral`) · Mes membres(**`/admin/members`**) · Plus | Personnes → `/pastoral/members` : Mes membres, Discipolat, Suivi pastoral ; Agenda → `/pastoral/events` : Événements, Agenda de l'église, Comptes rendus, [Agenda pastoral] Mon agenda, Vue agenda, Planification ; Demandes → `/pastoral/accounting` : Comptabilité, Questionnaires ; Ressources : Offres ; Administration complète |
| Pasteur sans rôle | idem | 5 espaces, 8 entrées ; **barre du bas et visite calculées comme pour un Resp. département** (rôle par défaut `layout.tsx` l.582, `guide/page.tsx` l.10-12) |

Planning, Médias (Audio) et Salles disparaissent en vue pastorale même pour qui y a droit.

### 2.4 Page d'accueil
- Hors vue pastorale : `/accueil` pour tous (`TODAY_HREF`, l.37). Raccourcis **figés** (`accueil/page.tsx` l.154-168) : Mon planning, Planning, Agenda de l'église, Mes demandes, Audio, Mon profil. Aucune file « à traiter » propre au rôle : rien sur la comptabilité, le suivi pastoral, le secrétariat, les candidatures ou la billetterie (seule exception : la carte « Questionnaires à remplir »).
- Vue pastorale : `/pastoral` (accueil distinct).

### 2.5 Taps / clics pour les tâches fréquentes

Mobile : destination de la barre du bas = 1 ; via « Plus » = Plus + espace + page (2 si l'espace n'a qu'une page). Desktop : espace replié + page = 2.

| Rôle | Tâche | Mobile | Desktop | Remarque |
|---|---|---|---|---|
| STAR | Voir son prochain service | 0 | 0 | carte de l'Accueil |
| STAR | Répondre à une disponibilité / déclarer une absence | 3 | 2 | Plus › Planning › Disponibilités |
| STAR | Réécouter un culte | 2 | 1 | Plus › Médias (une page) → `/audio` → redirection |
| STAR | Voir un événement depuis l'Accueil, puis revenir à l'agenda | 1 + retour vers **Accueil** | idem, fil d'Ariane vide | `/events/<id>/star-view` hors navigation du STAR |
| Resp. dép. | Remplir le planning (1er département) | 1 | 1 | `/dashboard` redirige vers le 1er |
| Resp. dép. | Planning d'un autre département | 3 | 2 | Plus › Planning › département |
| Resp. dép. | Absences de l'équipe | 4 | 3 | Disponibilités puis onglet `/absences` ; ensuite aucune entrée active |
| Secrétaire | Traiter les demandes | **3** | 2 | « Demandes » mène à *Mes demandes*, pas à la file |
| Secrétaire / Admin | Créer un événement | 3 | 2 | Plus › Agenda (9 pages) › Gérer les événements |
| Admin | Un écran d'administration | 3 | 2 | Administration : 12 lignes à plat sur mobile |
| Comptable | Traiter les demandes | 1 | 1 | |
| Comptable | Trésorerie | 2 | 2 | Comptabilité puis onglet, ou Plus › Demandes › Trésorerie (3) |
| Référent SP | Qualifier une demande | 1 | 1 | |
| Reporter | Saisir un compte rendu | 3 | 2 | Plus › Agenda › Comptes rendus |
| FD | Discipolat | 1 | 1 | |
| STAR PVS | Candidatures | 3 | 2 | rangées dans Personnes |
| STAR Navette | Déclarer une dépense | 3 | 2 | rangée dans Demandes |
| STAR organisateur | Contrôle d'entrée le jour J | 5 | 4 | Plus › Agenda › Billetterie › événement › Contrôle |
| Membre inscrit (sans rôle billetterie) | Retrouver sa réservation | **aucun chemin** | aucun | seulement par la notification (`ticketing/services/emails.ts` l.250) |
| Pasteur | Ses membres | 1 | 1 | mais la barre du bas ouvre `/admin/members`, la sidebar `/pastoral/members` |

---

## 3. Problèmes, classés par gravité

### Gravité haute (erreur de destination, écran introuvable, rôle mal servi)

**H1. Le STAR voit « Demandes » dans la barre du bas, et ce bouton ouvre le formulaire de RDV pastoral.**
`layout.tsx` l.213-215 ajoute « Demande RDV pastoral » à `requestLinks` quand il n'y a pas
`members:view` ; c'est la seule page de l'espace, donc `Demandes.href = /agenda/request`
(`navigation.ts` l.168-169) et `ROLE_PRIORITIES.STAR` contient `requests` (l.795). Le lien passe
en plus par une redirection 308 (`next.config.ts` l.30 → `/care/request`). L'entrée n'est donc
jamais active, et sur `/care/request` il n'y a ni fil d'Ariane ni chevron utile (sonde : actif
vide, retour « Accueil »).

**H2. Vue pastorale : « Mes membres » ne mène pas au même endroit selon le menu.**
Barre du bas : `/admin/members` (`navigation.ts` l.852, verrouillé par
`navigation.test.ts` l.311). Sidebar et « Plus » : `/pastoral/members` (l.260). Même libellé,
deux écrans différents, et l'onglet du bas n'est jamais actif sur la page « Mes membres » de la
sidebar.

**H3. Des écrans réels n'appartiennent à aucun espace : rien n'est actif, et le chevron revient à « Accueil »** (sondes `probe.txt`) :
- `/events/<id>/star-view` pour un STAR (ouvert depuis l'Accueil et depuis `/planning/events`) ;
- `/absences` (onglet « Indisponibilités de l'équipe » d'`AvailabilityTabs`) dès que le compte a
  une fiche liée : la navigation ne retient que `/disponibilites` (`navigation.ts` l.285-286) ;
- `/care/request` (H1) ;
- `/billetterie/mes-reservations`, `/formulaires/mes-reponses` : liés **seulement** depuis
  `/billetterie` et `/formulaires`, réservés aux gestionnaires. Un simple inscrit n'y accède que
  par une notification ;
- `/candidatures/ma-fiche` : lien depuis `/profile` seulement ;
- `/messages/<id>`, `/mcp/autoriser` : titre seul (`STANDALONE_LABELS`, l.649-652), retour vers Accueil ;
- `/pastoral/*` hors vue pastorale (retour « Accueil » = `/pastoral`, l.767).

**H4. La barre du bas dépend d'un « rôle principal » choisi au hasard.**
`currentRole = churchRoles.find(...)` (`layout.tsx` l.582) sans ordre défini. Un STAR également
Comptable, ou Resp. département également STAR, obtient l'une ou l'autre barre selon l'ordre
d'insertion en base. Le rôle Secrétaire virtuel est toujours ajouté en dernier. Sans aucun rôle
(pasteur seul), la valeur par défaut est `DEPARTMENT_HEAD` (même défaut dans `guide/page.tsx`).

**H5. Les rôles dont le travail est une file d'attente n'ont pas cette file comme destination.**
- Secrétaire : « Demandes » → `/requests` (ses propres demandes), alors que son métier est
  `/secretariat/requests` (3 taps).
- Comptable et Référent soins pastoraux : 2 destinations sur 4. Les destinations prévues par le
  tableau de `10-navigation.md` sont écartées comme doublons d'URL (`navigation.ts` l.861-866).
- Admin, Super Admin, Secrétaire : pas de « Planning » dans la barre du bas.

**H6. Le registre des Finances est éclaté entre trois endroits.**
Comptabilité, Navette et Trésorerie sont rangées sous « Demandes » (`requestPagesFor`, l.347-371),
la Page de dons sous Administration › [Finances] (`layout.tsx` l.36, `CONFIG_BLOCKS` l.229),
et les Statistiques comptables ne sont accessibles que par onglet (`AccountingNav.tsx` l.27).
Pour le Comptable, cela produit un espace « Administration » qui ne contient que « Page de dons ».

### Gravité moyenne (rangement incohérent, libellés, divergences entre supports)

**M1. Des pages sont rangées dans un espace qui ne leur correspond pas.**

| Page | Espace actuel | Problème |
|---|---|---|
| `/admin/events` « Gérer les événements », `/admin/welcome-duty`, `/admin/reports` | Agenda › [Église] | outils de gestion mêlés à la consultation et à l'agenda **pastoral** ; préfixe `/admin` |
| Vue agenda, Planification, Mon agenda (agenda des pasteurs) | Agenda › [Agenda pastoral] | séparés de « Suivi pastoral », rangé dans Personnes (`splitAgendaLinks`, l.190-194) : le domaine pastoral est coupé en deux |
| `/admin/discipleship`, `/admin/members` | Personnes | préfixe `/admin`, alors que ce sont des outils quotidiens |
| Billetterie, Formulaires | Agenda › [Inscriptions] | raisonnable, mais Questionnaires (même nature : collecte de réponses) est rangé ailleurs |
| Questionnaires `/collectes` | Demandes (l.351) | ni une demande ni un traitement ; sous un espace qui pour le STAR ne sert qu'au RDV |
| Comptabilité / Navette / Trésorerie | Demandes | voir H6 |
| `/dons` | Administration › [Finances] | voir H6 |
| Candidatures | Personnes | pour le PVS, c'est sa file de travail |
| Historique `/admin/audit-logs` | Administration › [Plateforme] | c'est un réglage de l'église (`church:settings`) ; pour l'Admin, le bloc Plateforme ne contient que lui |
| Assistant, Assistants IA (MCP) | Administration, bloc **sans intitulé** en fin de liste | absents de `CONFIG_BLOCKS` (l.219-235) |
| Messages système | Administration › [Organisation] | c'est de la communication, pas de l'organisation |
| Familles (externe) | Personnes, **pour tous les rôles** | STAR, Reporter, Comptable : un espace « Personnes » qui n'ouvre qu'un site externe |

**M2. Les mêmes libellés désignent des choses différentes.**

| Libellé | Occurrences |
|---|---|
| « Demandes » | l'espace ; « Mes demandes » ; « Traitement des demandes » ; sous-libellé Comptabilité (l.361) ; sous-libellé Intégration (l.248) ; onglet Visuels › Demandes ; onglet Comptabilité › Demandes |
| « Agenda » | l'espace ; « Agenda de l'église » (deux URL : `/events` et `/planning/events`) ; « Vue agenda » ; « Mon agenda » ; le bloc « Agenda pastoral » |
| « Salles » | Ressources `/rooms` **et** Administration `/admin/rooms` |
| « Collectes » | onglet `/disponibilites/collectes` (collecte de disponibilités) ; module `/collectes` affiché « Questionnaires » ; le fil d'Ariane nomme un élément `/collectes/<id>` « Campagne » |
| « Disponibilités » | `/disponibilites` ou `/absences` selon le compte (l.285-286) |
| « Offres » | `/jobs` et `/admin/jobs` (ce dernier redirige seulement vers `/jobs`) |
| « Statistiques » | 4 écrans (`/dashboard/stats`, `/accounting/stats`, `/integration/stats`, `/care/stats`), aucun dans la navigation sauf Intégration |
| « Fonctions dép. » | abréviation ; le guide parle encore de « Configuration → Départements → Fonctions » (`GuideContent.tsx` l.699) |
| « STAR » | entrée de Personnes = la liste de toutes les fiches, pas « mes STAR » |

**M3. Le mobile ne range pas les pages comme la sidebar.**
Le panneau « Plus » ignore `sidebarBlock` (choix documenté dans `Sidebar.md` l.11). Pour un Admin,
Administration s'affiche donc en 12 lignes à plat (17 pour un Super Admin), et Agenda en 9 lignes
dont seul « Agenda pastoral » a un intitulé. « Plus » répète aussi les espaces déjà présents dans
la barre du bas, Accueil compris (`MoreSheet.tsx` l.80-82). Ce n'est pas faux (il sert de plan
complet), mais rien ne le signale.

**M4. Trois mécanismes de navigation se superposent.**
- Comptabilité : la sidebar liste Comptabilité / Navette / Trésorerie, **et** `AccountingNav`
  répète les mêmes avec Statistiques en onglets. Le fil d'Ariane classe les onglets comme
  sous-pages (« Demandes › Comptabilité › Statistiques »), et le chevron mobile renvoie à
  « Comptabilité » depuis un onglet frère.
- Médias : sidebar (1 lien) → accueil à cartes → onglets (Visuels) ; Audio : lien → cartes ou
  redirection → onglets (`audio/tabs.ts`). Le modèle est cohérent pour ces deux espaces, mais
  propre à eux.
- Planning : sidebar par département **et** onglets de vue (`DashboardActions`) ; `/dashboard/stats`
  sans `?dept` → fil d'Ariane « Planning » seul et pas de retour.

**M5. Profondeur et densité très inégales selon le rôle.**
Super Admin 54 entrées (Personnes 10, Agenda 9, Administration 17) contre STAR 7 entrées
réparties dans 7 espaces, dont 4 à une seule page (Agenda, Personnes-externe, Demandes, Médias,
Ressources). Pour le STAR, le menu ressemble à une liste plate déguisée en espaces.

**M6. Le préfixe d'URL ne correspond pas à l'espace.**
`/admin/members`, `/admin/discipleship`, `/admin/events`, `/admin/reports`, `/admin/welcome-duty`
hors Administration ; `/accounting/*` sous Demandes ; `/dons` sous Administration ;
`/planning/events` sous Agenda ; `/agenda/request` → `/care/request`. C'est un problème de
lisibilité et de maintenance plus que d'usage : `admin/layout.tsx` n'impose que
`requireChurchAccess`.

**M7. La vue pastorale est une navigation à part.**
Une bascule (`switchToPastoralMode`, `layout.tsx` l.557-561), un second accueil `/pastoral`, des
pages `/pastoral/members|events|reports|accounting` qui doublent `/admin/members`, `/events`,
`/admin/reports`, `/accounting`, et une barre du bas à 2 destinations. Un pasteur qui est aussi
STAR perd Planning et Audio en vue pastorale, et ses droits de lecture sont reconstruits à la
main (`displayPermissions` l.113-119 ; `PASTORAL_READ_PERMISSIONS`, `auth.ts` l.486-492).

**M8. L'Accueil ne joue pas son rôle de tableau « À traiter ».**
`10-navigation.md` promet « tâches à traiter, demandes en attente, raccourcis du rôle ». En
pratique les raccourcis sont les mêmes pour tous (cf. §2.4), et les rôles à file d'attente
(Comptable, Référent SP, Secrétaire, PVS, organisateur) n'y trouvent rien.

**M9. La documentation et le code ont divergé.**
- `10-navigation.md` : Ressources contient « Guide » (en réalité dans le compte) ; la palette
  chercherait « les demandes » et proposerait des « actions fréquentes » (en réalité : 8 premières
  pages, STAR et événements seulement) ; le tableau de la barre du bas ne correspond pas à ce que
  voient le Comptable et le Référent SP (H5) ; le mobile devrait afficher le « titre de la page »
  sur une page de détail (en réalité, le libellé du parent).
- `BottomNav.md` l.3 : « n'offre aujourd'hui que deux destinations ».
- Les `navigation:` des manifestes : morts et faux (`/announcements`).

### Gravité basse (finitions)
- **B1** « Paramètres intégration », « Statistiques intégration » : libellés longs, raccourcis sur desktop seulement.
- **B2** Résultats STAR de la palette → `/admin/members?q=` : rechargement complet si l'on est déjà sur la liste (`CommandPalette.tsx` l.254-256).
- **B3** La palette sans saisie propose « les 8 premières pages », c'est-à-dire l'ordre de la sidebar, pas l'usage.
- **B4** Le fil d'Ariane omet l'espace quand celui-ci n'a qu'une page (`spaceIsPage`, l.728), d'où des fils de longueur variable pour une même page selon le rôle.
- **B5** « Plus, N nouveautés » ne compte que les badges des espaces absents de la barre du bas ; seul « Offres » porte un badge aujourd'hui.

---

## 4. Propositions

### 4.1 Principes
1. **Un espace = un métier**, nommé par ce qu'on y fait ; jamais par l'historique d'une spec.
2. **La destination d'un espace est la file de travail du rôle**, quand il en a une (Secrétaire :
   Traitement ; PVS : Candidatures ; Comptable : demandes à valider).
3. **Un libellé n'a qu'un sens** dans toute l'application (navigation, onglets, fil d'Ariane, guide, assistant).
4. **Tout écran connecté a un parent dans l'arborescence** : soit une page de navigation, soit une
   sous-page déclarée. `navigation-subpages.test.ts` doit l'exiger, pas seulement un libellé.
5. **Mobile et desktop rangent les pages de la même façon** (les blocs passent dans « Plus »).
6. **Les onglets ne répètent pas la sidebar** : une entrée de sidebar par écran, les onglets
   restent internes à cet écran.

### 4.2 Architecture cible (option recommandée « A »)

| # | Espace (section) | Contenu | Rôles concernés |
|---|---|---|---|
| 1 | **Accueil** | « Aujourd'hui » + bloc **À traiter** par rôle (compteurs des files ci-dessous) | tous |
| 2 | **Planning** (Mon service) | Mon planning · Disponibilités (avec l'onglet Équipe, qui devient une page reconnue) · [Départements] | STAR, RD, Min, Sec, Admin ; Disponibilités seule pour Comptable/FD/Reporter avec fiche |
| 3 | **Événements** (ex-Agenda) | Calendrier de l'église (une seule entrée, `/events` ou `/planning/events` selon le droit) · Gérer les événements · Service d'accueil · Comptes rendus · Trame des annonces · [Inscriptions] Billetterie, Formulaires, **Mes inscriptions** (réservations + réponses) | tous |
| 4 | **Pastoral** (nouveau, Mon service) | Mon agenda · Agenda des pasteurs (ex-« Vue agenda ») · Planification · Suivi pastoral · Demander un RDV | Protocole, RSP, pasteurs, Admin, Sec ; « Demander un RDV » pour tous |
| 5 | **Personnes** | STAR · Discipolat · Candidatures · [Intégration] · Familles (seulement pour qui touche aux personnes) | RD, Min, Sec, Admin, FD, PVS, Intégration |
| 6 | **Demandes** | Mes demandes · Traitement des demandes · Questionnaires (à remplir / à piloter) | ceux qui demandent ou traitent ; le STAR y trouve RDV et questionnaires via Mes demandes si l'on ouvre `/requests` (cf. Q3) |
| 7 | **Finances** (nouveau, Église) | Demandes comptables · Statistiques · Navette · Trésorerie · Page de dons | Comptable, Admin, Min/RD (soumission), équipe Navette |
| 8 | **Médias** | Communication & Production · Audio (inchangé) | |
| 9 | **Ressources** | Salles (+ Mes réservations de salle) · Offres | |
| 10 | **Administration** (Église) | [Église] Paramètres, Ministères, Départements, Fonctions des départements, Salles (configuration, renommée « Configuration des salles ») · [Accès] Utilisateurs, Accès & rôles, Profils pastoraux · [Communication] Messages système · [Suivi] Historique | Admin, Sec (partiel), Min (partiel) |
| 11 | **Plateforme** (nouveau, Super Admin seul) | Églises, Sauvegardes, API, Icône de l'application, Domaines des sites, Assistant, Assistants IA | Super Admin |

Barre du bas cible (le rôle principal devient déterministe : la priorité la plus « opérationnelle » des rôles de l'église courante, cf. Q6) :

| Rôle | Destinations |
|---|---|
| STAR | Accueil · Mon planning · Événements · Médias (Audio) · Plus *(ou Pastoral, Q3)* |
| Resp. dép., Ministre | Accueil · Planning · Événements · Personnes · Plus |
| Secrétaire | Accueil · **Traitement** · Événements · Personnes · Plus |
| Admin, Super Admin | Accueil · Événements · Personnes · Planning · Plus *(Demandes reste dans Plus)* |
| Référent SP | Accueil · Suivi · Pastoral · Personnes · Plus |
| Comptable | Accueil · À valider · Trésorerie · Navette · Plus (destinations de page dans Finances) |
| Faiseur de disciples | Accueil · Discipolat · Événements · Plus |
| Reporter | Accueil · Comptes rendus · Événements · Plus |
| Vue pastorale | Accueil · Mes membres (**`/pastoral/members`**) · Pastoral · Plus |

Effet attendu sur les taps (mobile) : Secrétaire / traiter 3 → 1 ; Reporter / compte rendu 3 → 1 ;
Comptable / trésorerie 2-3 → 1 ; STAR / retrouver sa réservation : impossible → 3 ; organisateur /
contrôle d'entrée : inchangé (5), sauf si l'Accueil affiche « Événement du jour » (→ 2).

### 4.3 Arbitrages, avec options

**Arbitrage 1 : Finances.**
- *A1 (recommandé)* : un espace **Finances** propre. + un seul endroit pour la compta, la navette,
  la trésorerie et les dons ; l'Administration du Comptable disparaît ; les onglets
  d'`AccountingNav` deviennent la sidebar. − un espace de plus (11) ; pour le Ministre et le Resp.
  département, l'espace ne contient que « Demandes comptables » (on peut ne garder chez eux que
  l'entrée dans « Mes demandes », cf. spec 043).
- *A2* : Finances comme **bloc** de Demandes, avec Dons déplacée dedans. + moins d'espaces. − le
  mélange « je demande » / « je tiens la caisse » reste, et la navette reste rangée sous « Demandes ».

**Arbitrage 2 : Agenda / Événements / Pastoral.**
- *B1 (recommandé)* : « Agenda » devient **Événements** (église et inscriptions) ; nouvel espace
  **Pastoral** (agenda des pasteurs, planification, suivi, RDV). + met fin au double sens
  d'« Agenda » et réunit le domaine pastoral, coupé aujourd'hui entre Agenda et Personnes ; prépare
  la fusion de la vue pastorale. − un espace de plus ; « Suivi pastoral » quitte Personnes (fiches
  de l'assistant et visite à mettre à jour).
- *B2* : garder **Agenda** avec deux blocs, renommer les entrées (« Calendrier de l'église »,
  « Agenda des pasteurs ») et ramener « Suivi pastoral » dans le bloc pastoral. + rien de nouveau
  au premier niveau. − « Agenda » continue de désigner deux mondes, et le Protocole et le RSP
  restent dans un espace à 9 entrées.
- *B3* : séparer **Événements** et **Inscriptions** (billetterie, formulaires, questionnaires)
  en deux espaces. + Questionnaires trouve une place naturelle. − ajoute surtout du volume pour
  l'Admin.

**Arbitrage 3 : Administration de l'église / plateforme.**
- *C1 (recommandé)* : espace **Plateforme** réservé au Super Admin. + l'Admin ne voit plus un bloc
  « Plateforme » qui ne contient que « Historique » ; chaque espace a un seul public.
- *C2* : garder un seul espace, avec des blocs corrigés (Historique dans [Église], Assistant et MCP
  dans [Plateforme]). + changement minimal.

**Arbitrage 4 : vue pastorale.**
- *D1* : la supprimer à terme. L'espace Pastoral et les droits de lecture pastoraux couvrent ses
  besoins ; `/pastoral` devient un bloc de l'Accueil. + une seule navigation. − refonte de
  `/pastoral/*` ; à valider avec les pasteurs.
- *D2 (prudent)* : la garder, mais construite comme un **filtre** de la navigation commune (mêmes
  espaces, Planning et Médias conservés) et non comme une liste à part ; corriger H2.

**Arbitrage 5 : URL.**
- *E1 (recommandé à court terme)* : ne changer que le rangement et les libellés ; aucune URL ne
  bouge (lots 0 à 3).
- *E2* : aligner les préfixes sur les espaces (`/personnes/star`, `/evenements/gestion`,
  `/finances/...`, `/plateforme/...`) avec des redirections permanentes. Coût élevé :
  `Notification.link` est **stocké en base** (`schema.prisma` l.799), il y a des liens dans des
  emails déjà envoyés, des `routes` de manifestes (ADR-0012) et `route-exhaustiveness.test.ts`.
  Une redirection par ancien chemin est obligatoire, sur le modèle de `next.config.ts` l.28-33.

### 4.4 Ce qui change d'URL et ce qui change seulement de rangement

| Changement | Rangement seul (E1) | URL (E2, optionnel) |
|---|---|---|
| Comptabilité, Navette, Trésorerie, Statistiques, Dons → Finances | oui | `/accounting/*` → `/finances/*`, `/dons` → `/finances/dons` |
| Gérer les événements, Service d'accueil, Comptes rendus → Événements | oui (libellé d'espace) | `/admin/events` → `/evenements/gestion`… |
| Agenda pastoral + Suivi + RDV → Pastoral | oui | aucune (`/agenda`, `/care` restent) |
| STAR, Discipolat | non | `/admin/members` → `/personnes`, `/admin/discipleship` → `/discipolat` |
| Plateforme | oui | `/admin/{backups,api,app-icon,site-domains,assistant,mcp}` → `/plateforme/*` |
| Lien RDV pastoral | **oui : pointer `/care/request` directement** (supprime la redirection 308 et l'entrée jamais active) | |
| « Mes inscriptions » | nouvelle entrée vers `/billetterie/mes-reservations` + `/formulaires/mes-reponses` (ou un écran qui réunit les deux) | |
| `/absences` | déclarée comme sous-page de Disponibilités (`matchPrefixes`) | |

### 4.5 Impacts
- **Code** : `navigation.ts` (`buildSpaces`, `SpaceKey`, `ROLE_PRIORITIES`, `CONFIG_BLOCKS`,
  `SUBPAGE_LABELS`/`ITEM_LABELS`, `STANDALONE_LABELS`) ; `(auth)/layout.tsx` (rôle principal,
  `famillesUrl`, liens) ; `MoreSheet`/`NavPageList` (blocs) ; `AccountingNav` (si Finances) ;
  `accueil/page.tsx` (bloc À traiter) ; `CommandPalette` (actions). Supprimer les `navigation:`
  morts des 9 manifestes (et le type `NavigationItem`, `core/module-registry.ts` l.70).
- **Tests** : 7 fichiers `src/lib/__tests__/navigation*.test.ts` (dont l'assertion H2
  `navigation.test.ts` l.311), `nav-match.test.ts`, `navigation-subpages.test.ts` (à renforcer :
  « chaque page a un parent »), `route-exhaustiveness.test.ts` et `src/core/__tests__` si E2.
- **Visite guidée** : ancres `data-tour` (`sidebar-events`, `sidebar-service`, `sidebar-config`,
  `sidebar-pastoral`, `sidebar-reports`, `bottom-nav`) dans `tour-steps.ts` (17 cibles) ; rôle par
  défaut.
- **Guide** : `GuideContent.tsx` (932 lignes, mentions « menu « … » », « Configuration → … »,
  « Administration ») ; `docs/guide-screenshots.md` (captures à refaire).
- **Assistant** : fiches `src/modules/assistant/knowledge/*.ts` (`href`/`hrefLabel`, environ
  220 chemins littéraux ; textes « Demandes › Questionnaires », « Candidatures › Entretiens ») ;
  `synonyms.ts` (Agenda/Événements, Finances) ; `eval.ts`.
- **MCP** : les outils ne dépendent pas des menus ; `draft_request` → `/requests/new` inchangé.
- **Documentation** : `docs/design-system/guidelines/10-navigation.md` (tableau des espaces et de
  la barre du bas), `components/{Sidebar,BottomNav,BottomSheet,TopBar}.md`, CLAUDE.md
  (paragraphe « Navigation »), `docs/architecture.md` si E2. ADR conseillé : « architecture
  d'information par métier » (décision durable et transverse aux modules, règle 13).
- **Données** : aucune en E1. En E2 : redirections pour `Notification.link`, liens d'email,
  favoris et raccourcis PWA.

### 4.6 Découpage en lots
- **Lot 0 — Corrections, sans changement d'architecture (1 PR, petit)** : H2 (destination
  pastorale) ; RDV pastoral vers `/care/request` ; `/absences` et `/events/<id>/star-view` du
  STAR rattachés à une page ; Assistant et MCP dans un bloc ; Historique hors [Plateforme] ;
  Familles réservé à qui touche aux personnes (Q7) ; rôle principal déterministe (H4) ; manifestes
  `navigation:` supprimés ; documentation resynchronisée.
- **Lot 1 — Rangement et libellés (E1)** : nouveaux espaces (Finances, Événements, Pastoral,
  Plateforme selon arbitrages), libellés uniques (table M2), destinations d'espace = file de
  travail, blocs dans « Plus », `AccountingNav` aligné sur la sidebar. Test « chaque page
  `(auth)` a un parent ».
- **Lot 2 — Mobile et Accueil** : barre du bas cible (§4.2), bloc « À traiter » de l'Accueil
  par rôle (compteurs déjà calculés par les écrans), « Mes inscriptions », palette avec actions
  fréquentes (« Déclarer une absence », « Nouvelle demande », « Nouvel événement »).
- **Lot 3 — Vue pastorale** (D1 ou D2).
- **Lot 4 (optionnel) — URL alignées (E2)** avec redirections, manifestes, contrats et tests.
- Chaque lot touche aussi le guide, les fiches de l'assistant, la visite guidée et la doc
  design-system (à inclure dans la PR, pas après). `npm run build` avant recette (frontière
  client/serveur).

---

## 5. Questions à trancher par le propriétaire

1. **Finances** : espace propre (A1) ou bloc de Demandes (A2) ? Le Ministre et le Resp.
   département doivent-ils voir Finances, ou seulement soumettre depuis « Mes demandes » ?
2. **Agenda** : B1 (Événements + Pastoral), B2 (Agenda renommé à l'intérieur) ou B3
   (Inscriptions séparé) ? Où ranger les **Questionnaires** : Demandes, Inscriptions, ou Accueil
   seul pour les répondants ?
3. **STAR** : que doit ouvrir le 4e bouton de la barre du bas ? Médias/Audio, Événements,
   Pastoral (RDV), ou « Mes demandes » ouvert au STAR (RDV + questionnaires + navette) ?
4. **Administration / Plateforme** : séparer (C1) ou corriger les blocs seulement (C2) ?
5. **Vue pastorale** : la supprimer à terme (D1) ou la garder comme filtre (D2) ? Un pasteur
   également STAR doit-il garder Planning et Audio en vue pastorale ?
6. **Rôle principal** d'un compte à plusieurs rôles : quelle priorité ? (Proposition : Admin >
   Secrétaire > Comptable > RSP > Ministre > Resp. dép. > Reporter > FD > STAR, ou bien la barre
   construite sur l'union des rôles.)
7. **Familles** (site externe) : pour qui ? Tous, ou seulement Intégration, bergers, pasteurs et
   administration ?
8. **URL** : rangement seul (E1) pour cette refonte, ou alignement des préfixes (E2) maintenant ?
9. **Accueil « À traiter »** : quelles files par rôle (demandes secrétariat, validations compta,
   suivi pastoral, candidatures, paiements billetterie, questionnaires, remplacements) ? Sur
   l'Accueil seulement, ou aussi en badge sur la barre du bas et la sidebar ?
10. **Palette** : ajouter des actions (créer, déclarer) et la recherche de demandes, comme le
    prévoit `10-navigation.md`, ou corriger la doc pour qu'elle décrive l'existant ?
11. **Salles** : renommer l'entrée d'administration « Configuration des salles », ou la fusionner
    dans `/rooms` avec un onglet réservé à `rooms:manage` ?
12. **Gestion des événements** : garder « Agenda de l'église » (consulter) et « Gérer les
    événements » (créer) comme deux entrées, ou un seul écran avec un mode gestion pour
    `events:manage` ?
