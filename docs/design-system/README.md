Koinonia est le back-office opérationnel de l'église, en une seule application : planning de service, comptes rendus, discipolat, demandes, médias, audio, salles, comptabilité et agenda pastoral, derrière une source de vérité unique qui remplace les groupes WhatsApp et les tableaux Excel. Chaque rôle n'y voit que ce qui le concerne. On l'ouvre surtout sur un téléphone, pour une tâche précise : voir son planning, marquer une absence, valider une demande. Le système sert cette réalité : **trouver vite, agir en un geste, comprendre l'état d'un coup d'œil**, sur mobile comme sur desktop.

## Principes

1. **Le téléphone d'abord.** Chaque écran est conçu à 375px puis élargi. Une cible tactile fait au moins `control-md` (44px). Rien d'important ne se trouve uniquement au survol.
2. **Un écran, une tâche.** Une page a un titre, au plus une action principale (`Button` primary), et ses actions secondaires en retrait (`Button` secondary ou ghost, menu « ⋯ »).
3. **L'état se voit sans lire.** Un statut porte toujours une couleur sémantique **et** un mot (et une icône quand la place manque) : `StatusChip`, jamais une couleur seule.
4. **Le calme, puis l'accent.** Les neutres (`bg`, `surface`, `ink`) font 90 % de l'écran. Le violet (`brand`) indique l'action et la position ; le jaune (`accent`) signale une nouveauté ou une mise en avant, pas plus d'une fois par écran.
5. **Pas d'attente muette.** Toute navigation affiche un squelette (`Skeleton`) en moins de 100 ms ; toute action donne un retour (`Toast`, état du bouton) ; les enregistrements sont optimistes quand ils peuvent l'être.

## Voix et contenu

- Écrire en français courant, au vouvoiement dans les messages système (« Vous n'avez pas encore de service ce mois-ci »), et à la première personne dans les libellés personnels (« Mon planning », « Mes demandes »).
- Garder la terminologie de l'église telle quelle : **STAR** (masculin : « un STAR »), **département**, **ministère**, **culte**, **debrief**, **MSDP**. Ne pas la traduire en jargon produit.
- Libellés de bouton : un verbe à l'infinitif qui dit ce qui va se passer (« Enregistrer », « Marquer indisponible », « Valider la demande »). Pas de « OK », pas de « Soumettre ».
- Confirmation après action : le participe passé (« Absence enregistrée », « Demande validée »).
- Erreurs : dire ce qui bloque et comment s'en sortir (« Ce STAR est déjà dans ce département. Choisissez un autre département. »). Pas d'excuses, pas de code technique.
- Majuscule en début de libellé seulement (« Demandes d'accès », pas « Demandes D'Accès »). Les capitales ne servent qu'au style `overline`.
- Accents complets, y compris sur les majuscules (« Événements », « À traiter »). Corriger les libellés hérités sans accents (« selectionne », « Remplacant »).
- Pas d'emoji dans l'interface. Les pictogrammes passent par le jeu d'icônes (voir Iconographie).

## Couleur

Les quatre couleurs de la charte ICC restent la source (`icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`), mais l'interface ne les utilise jamais directement : elle passe par des tokens sémantiques qui existent en thème clair et sombre.

- Poser la page sur `bg`, le contenu sur `surface`. Réserver `surface-sunken` aux en-têtes de tableau, aux champs de recherche au repos et aux squelettes.
- Texte : `ink` pour le contenu, `ink-muted` pour les descriptions et libellés, `ink-subtle` pour l'horodatage et les placeholders. Ne jamais descendre plus clair que `ink-subtle`.
- Filets : `line` pour séparer, `control-line` pour délimiter un contrôle (champ, case, bouton secondaire). Un champ bordé en `line` ne se voit pas assez (1.3:1).
- Violet : `brand` en aplat (bouton principal, pastille active) avec `on-brand` dessus ; `brand-text` quand le violet est du texte ; `brand-soft` en fond de l'élément actif ou sélectionné. Le survol du bouton principal passe à `brand-hover`, plus au jaune.
- Jaune : `accent` en aplat avec `on-accent` dessus, jamais en texte (1.1:1 sur blanc). `accent-soft` surligne une ligne arrivée par un lien ou une nouveauté.
- Sémantique : `success`, `warning`, `danger`, `info` pour le texte et les icônes, leurs variantes `-soft` pour les fonds. `danger` remplace `icc-rouge` partout où il y a du texte : #FF3131 ne fait que 3.7:1 sur blanc.
- Statuts de service : **En service** `success`, **En service + Debrief** `brand-text` sur `brand-soft`, **Indisponible** `danger`, **Remplaçant** `info`. Le vert `success` est tiré vers le bleu pour qu'un daltonien le distingue de `danger` ; le mot reste de toute façon affiché.
- Le mode sombre suit le réglage du système, avec un choix manuel (Clair / Sombre / Système) dans « Mon profil ». Chaque token a sa valeur sombre : ne jamais écrire de couleur en dur, ni `bg-white`, ni `text-gray-500`.

### Couleur de l'église

Chaque église a sa couleur (`Church.primaryColor`). Aujourd'hui elle remplit toute la barre supérieure, ce qui casse le contraste quand elle est claire et ignore le mode sombre. Désormais : la barre supérieure est toujours `surface` ; la couleur de l'église apparaît en pastille de 10px devant son nom dans le sélecteur d'église et en filet de 3px sous la barre supérieure. Elle identifie l'église, elle ne colore pas l'interface.

## Typographie

La charte ICC Rennes (département Production Média) définit quatre polices : **Montserrat**, **Loubag** (capitales condensées), **Now** (géométrique fine) et **Brittany** (script manuscrit). Dans l'application, seule Montserrat est retenue : Loubag et Brittany sont des polices d'affiche, illisibles en petit corps ; Now, très fine, ne tient pas dans une interface dense. Ces trois polices restent réservées aux visuels de communication (affiches, réseaux sociaux), pas à Koinonia.

- **Montserrat** (famille `display`), la police de la charte, pour ce qui se reconnaît : titres, libellés de bouton, onglets, navigation. Styles `title-xl` à `title-sm`, `label`, `overline`.
- **Source Sans 3** (famille `body`) pour ce qui se lit et se compare : texte courant, tableaux, grille de planning, formulaires. Styles `body`, `body-strong`, `body-sm`, `caption`, `numeric`. Montserrat est très large : dans une grille de planning à 375px, Source Sans 3 laisse tenir le nom complet du STAR là où Montserrat le tronque.
- Les deux polices sont chargées par `next/font/google` (auto-hébergées, sans requête externe, `display: swap`), en fonte variable : un seul fichier par famille.
- Titre de page : `title-xl` à partir de 768px, `title-lg` en dessous. Un seul titre de page par écran.
- Texte saisi : style `input` (16px). En dessous de 16px, Safari iOS zoome la page au focus.
- Chiffres en colonne : style `numeric` avec `font-variant-numeric: tabular-nums`.
- Mesure : un paragraphe ne dépasse pas `reading-max` (680px). Les titres prennent `text-wrap: balance`.

## Espacement et mise en page

- Grille de 4px : `space-1` à `space-12`. Ne pas inventer de valeur intermédiaire.
- Gouttière latérale : `space-4` sur mobile, `space-6` à partir de 768px. Écart entre sections d'une page : `space-6` ; entre champs d'un formulaire : `space-4`.
- Contenu limité à `content-max` (1200px), formulaires et textes à `reading-max`.
- Composer avec `gap` (flex, grid), pas avec des marges empilées sur chaque enfant.
- Points de rupture : **< 768px** mobile (barre supérieure + barre du bas) ; **768–1023px** tablette (rail d'icônes `rail`) ; **≥ 1024px** desktop (sidebar dépliée `sidebar`). Voir la section Navigation.

## Formes et élévation

- Rayons par rôle, pas un rayon unique partout : `radius-sm` pour ce qui est petit (pastille, case, cellule de planning), `radius-md` pour les contrôles, `radius-lg` pour les cartes et dialogues, `radius-xl` pour le haut des feuilles mobiles, `radius-full` pour les compteurs et avatars.
- Bordures de 1px. L'ancienne bordure de 2px (`border-2`) partout alourdit les écrans denses ; la garder uniquement pour l'état sélectionné d'une carte.
- Élévation : `shadow-1` pour une carte au repos (aucune ombre en sombre, la carte se détache par `surface` et `line`), `shadow-2` pour ce qui flotte (menu, toast, barre d'actions), `shadow-3` pour ce qui prend le premier plan (dialogue, feuille).
- Une carte n'est une carte que si elle est un objet qu'on ouvre ou qu'on déplace. Une section de page n'a pas de cadre : un titre `title-md` et de l'espace suffisent.

## Mouvement

- Durées `duration-fast` (contrôles), `duration-base` (menus, toasts, transitions de page), `duration-slow` (feuilles, dialogues plein écran).
- Ce qui entre décélère (`ease-out`), ce qui sort accélère (`ease-in`) et dure moins longtemps.
- Transitions de page par l'API View Transitions (fondu enchaîné de 200ms, le titre de page glisse de 8px). Une feuille du bas monte depuis le bas ; un dialogue desktop apparaît en fondu et à l'échelle 0.98 → 1.
- Sous `prefers-reduced-motion: reduce`, remplacer tout déplacement par un fondu de `duration-fast`.

## États et interactions

- Focus clavier : anneau `focus` plein de 2px, décalé de 2px (`outline: 2px solid var(--focus); outline-offset: 2px`), visible uniquement au clavier (`:focus-visible`). Ne jamais le retirer.
- Survol (desktop seulement) : fond `surface-sunken` pour une ligne ou un élément de liste, `brand-hover` pour le bouton principal. Appui : `transform: scale(0.98)` pendant `duration-fast`.
- Désactivé : opacité 0.45 et curseur `not-allowed` ; préférer expliquer pourquoi une action est indisponible plutôt que la désactiver en silence.
- Chargement d'un bouton : le libellé devient l'action en cours (« Enregistrement… ») et le bouton se désactive ; pas de spinner seul.
- Sélection : fond `brand-soft`, case cochée en `brand`. Mise en évidence (arrivée par un lien) : fond `accent-soft` qui s'estompe en 2 s.

## Iconographie

- Une seule famille : **Lucide** (`lucide-react`), trait de 1.75px, taille 20px dans la navigation et 16px dans les boutons et pastilles. Elle prolonge le style trait des icônes Heroicons actuelles, mais sans les recopier en SVG dans chaque composant (Sidebar, MobileNavSheet et BottomNav dupliquent aujourd'hui les mêmes tracés).
- Une icône hérite de la couleur du texte (`currentColor`) : `ink-subtle` au repos dans la navigation, `brand-text` quand l'élément est actif.
- Une icône seule (bouton icône) a toujours un `aria-label` et une infobulle sur desktop.
- Pas d'emoji comme pictogramme, y compris dans le bandeau de recette : une icône `triangle-alert`.

## Logo

Le logo ICC Rennes (groupe d'assets **Logos**) associe cinq plumes de couleur à un monogramme « ICC » et au mot « RENNES », dessinés en blanc.

- **Logo complet, lettres blanches** (`icc-rennes-logo-blanc.svg`, `.png`) : comme dans la charte, sur un aplat plein de l'une des quatre couleurs (`icc-violet`, `icc-jaune`, `icc-rouge`, `icc-bleu`) ou sur un fond sombre : écran de connexion, en-tête des emails, thème sombre.
- **Logo complet, lettres sombres** (`icc-rennes-logo-sombre.svg`, `.png`) : sur `surface`, `bg` clair et tout fond clair (documents, exports PDF, thème clair). Les lettres prennent `ink` (#1b1530) ; les plumes ne changent pas.
- **Plumes seules** (`icc-plumes.svg`, `.png`) : la marque de l'application, en tête de la sidebar à côté de « Koinonia » (Montserrat 700) et dans la barre supérieure mobile, devant le nom de l'église.
- **Icône d'application** (`koinonia-app-icon.svg`) : les plumes sur un carré blanc de rayon 112/512, pour remplacer `public/icons/icon.svg` (lettres « PC ») et les icônes du manifeste PWA. Sous 32px, les plumes deviennent des traits : la charte gagnerait une version simplifiée pour le favicon.
- Préférer les SVG, nets à toutes les tailles. Ils ont été vectorisés automatiquement à partir du PNG fourni : à valider par Production Média, qui détient peut-être le fichier vectoriel d'origine.
- Sur `icc-violet`, la plume violette se confond avec le fond (1.1:1) et sur `icc-jaune` la plume jaune disparaît : la charte l'accepte, mais pour un usage de petite taille (moins de 64px), préférer `icc-rouge` ou `icc-bleu`, où les cinq plumes restent visibles.
- Ne pas étirer, recolorer les plumes ni les séparer du monogramme dans le logo complet. Seule la couleur des lettres change, blanche ou `ink`, selon le fond.
- Les couleurs des plumes (`plume-rouge`, `plume-bleu`, `plume-vert`, `plume-violet`, `plume-jaune`) sont relevées sur le fichier fourni. Elles servent aux illustrations et aux graphiques, jamais aux textes ni aux contrôles. Le violet des plumes (#653c81) est plus sourd que le violet d'interface `icc-violet` (#5e17eb).

## Accessibilité

- Tout texte atteint 4.5:1 sur son fond dans les deux thèmes ; chaque token de texte indique les fonds sur lesquels il est vérifié. Bordures de contrôle, anneau de focus et icônes porteuses de sens atteignent 3:1.
- Une information n'est jamais portée par la couleur seule : un mot ou une icône l'accompagne.
- Cibles tactiles de 44 × 44px minimum, espacées de 8px.
- Dialogues : focus piégé, fermeture par Échap, retour du focus sur le déclencheur. Feuilles du bas : fermeture par glissement vers le bas **et** par un bouton.
- Respecter les zones de sécurité iOS (`env(safe-area-inset-bottom)`) sous la barre du bas et les feuilles.

## Composants

Les composants reprennent l'inventaire de `src/components/ui/` et de la coquille (`Button`, `Field` pour Input/Select/Textarea, `Checkbox` pour CheckboxGroup, `CountBadge` pour Badge, `Dialog` pour Modal et ConfirmModal, `DataTable`, `BulkActionBar`, `Tabs` pour SpaceTabs, `SpaceCard` pour SpaceHome, `PlanningGrid`, `StagingBanner`, `TopBar`, `Sidebar`, `BottomNav`, `BottomSheet` pour MobileNavSheet). Les classes `k-*` de `components/bundle.css` en sont l'implémentation de référence, écrite uniquement sur les tokens.

Deux maquettes (groupe **Maquettes**) assemblent ces composants en écrans réels : le planning d'un culte vu par un responsable de département sur desktop, et trois écrans mobiles (accueil d'un STAR, planning d'un responsable, menu « Plus »).

Ajouts volontaires, parce qu'un besoin existe sans composant commun : `IconButton` (les « × » et icônes cliquables sont refaits à chaque écran), `StatusChip` (couleurs de statut définies au cas par cas), `Alert` (bandeaux d'avertissement ad hoc), `PageHeader` (chaque page compose son titre et ses actions), `Toast` (aucun retour après action), `Skeleton` (aucun état de chargement), `EmptyState` (« Aucune donnée. » sans suite). Extraits ensuite d'un écran pour servir à plusieurs : `FilterChip` et `SearchInput` (barre d'outils des listes filtrables, spec 064).
