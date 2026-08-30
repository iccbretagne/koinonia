# Spec — Salles : visualisation multi-salles et suivi de ses propres réservations

- **Numéro** : 032
- **Statut** : Implémentée
- **Créée le** : 2026-08-30
- **Branche suggérée** : `feat/salles-vue-multisalles`
- **Issue** : [#466](https://github.com/iccbretagne/koinonia/issues/466)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

La page **Salles** propose aujourd'hui deux vues :

- un **calendrier** mensuel qui n'affiche **qu'une seule salle à la fois** : l'utilisateur
  choisit une salle dans une liste déroulante, et ne voit que les réservations de
  celle-ci ;
- une **liste** de toutes les réservations, avec des filtres (salle, statut de main
  courante, tri) et une case à cocher « Mes réservations uniquement ».

L'église exploite **plusieurs salles**. Deux besoins ne sont donc pas couverts :

**1. Comparer les salles entre elles.** La question quotidienne d'un responsable qui veut
poser une activité est « **quelle salle est libre jeudi soir ?** ». Y répondre impose
aujourd'hui de sélectionner chaque salle l'une après l'autre et de mémoriser ce qu'on a
vu — un aller-retour par salle, sans jamais avoir la vue d'ensemble sous les yeux. Plus
il y a de salles, plus l'exercice devient impraticable, et plus le risque de poser une
réservation en conflit augmente.

**2. Suivre ses propres réservations.** La main courante impose au réservant deux gestes
datés : **déclarer l'ouverture** de la salle, puis **déclarer la fermeture**. Or ses
réservations ne sont visibles qu'en cochant une case qui **remplace** la liste complète :
pour vérifier ce qu'il doit déclarer, l'utilisateur doit quitter la vue en cours, filtrer,
agir, puis reconstituer sa navigation. Rien ne lui rappelle passivement qu'une déclaration
est en attente, ce qui alimente les mains courantes jamais ouvertes ou jamais fermées.

**3. Naviguer à la semaine.** Le mois est la seule granularité disponible. C'est trop
large pour organiser la semaine à venir, qui est l'horizon réel de décision.

S'ajoute une **anomalie d'affichage** constatée : les réservations sont réparties dans les
cases du calendrier d'après la date **universelle (UTC)** de leur horaire de début, et non
d'après la date **locale**. Une réservation qui commence tard le soir (heure française)
est donc affichée **le jour précédent**. Le bug est invisible la plupart du temps, mais il
touche précisément les activités de soirée, fréquentes dans une église.

## Utilisateurs concernés

Les rôles qui accèdent déjà au module salles — la feature **ne change aucun droit**, elle
réorganise ce qui est déjà visible.

| Rôle | Ce qu'il peut faire |
|---|---|
| **Super Admin**, **Admin** | Voient toutes les salles et toutes les réservations ; réservent ; annulent n'importe quelle réservation |
| **Ministre**, **Responsable de département** | Voient toutes les salles et toutes les réservations ; réservent ; annulent **leurs** réservations |
| **Secrétaire** | Voit toutes les salles et toutes les réservations, en **lecture seule** (ne réserve pas) |
| **STAR**, **Faiseur de Disciples**, **Reporter** | **Aucun accès** au module salles (décision de la spec 031) — non concernés |

L'encart « Mes réservations » ne concerne que les rôles qui **peuvent réserver**. Pour un
Secrétaire, qui consulte sans jamais réserver, il n'a rien à montrer.

## Comportement attendu

### Scénario principal — « quelle salle est libre jeudi ? »

1. Un responsable de département ouvre la page Salles. Elle s'ouvre sur la **semaine en
   cours**, présentée comme un tableau : **une ligne par salle**, **une colonne par jour**,
   du lundi au dimanche.
2. Chaque case du tableau montre les réservations de cette salle ce jour-là : **heure de
   début** et **titre de l'activité**. Une case vide signifie que la salle est libre ce
   jour-là.
3. Il parcourt la colonne « Jeudi » du regard : deux salles y ont une activité, la
   troisième est vide. Il a sa réponse **sans changer d'écran ni de sélection**.
4. Il clique sur une réservation existante pour en consulter le détail (salle, horaires,
   auteur, état de la main courante).
5. Il navigue vers la semaine suivante, puis revient, à l'aide des flèches de période.
6. Il crée sa réservation depuis le bouton habituel.

### Scénario — suivre et déclarer ses propres réservations

1. Le même responsable arrive sur la page. Avant même la grille, un **encart « Mes
   réservations »** lui présente ses **prochaines** réservations, dans l'ordre
   chronologique.
2. Cet encart est présent **quelle que soit la vue affichée** (semaine, mois ou liste) et
   **quels que soient les filtres** appliqués à cette vue : il ne dépend que de son
   identité.
3. Pour la réservation du jour, dont la main courante n'est pas encore ouverte, l'encart
   propose directement l'action **« Déclarer l'ouverture »**. Il la déclenche sans quitter
   la page ni changer de vue.
4. Plus tard, la même ligne propose **« Déclarer la fermeture »**. L'action proposée suit
   donc l'état réel de la main courante.
5. Il replie l'encart quand il ne veut plus le voir, et le déplie à nouveau.
6. Quand il a plus de réservations à venir que l'encart n'en montre, un lien lui donne
   accès à **la totalité de ses réservations**.

### Scénario — retrouver ses réservations dans les grilles

1. Dans la grille semaine comme dans le calendrier mensuel, **ses propres réservations
   sont visuellement distinguées** de celles des autres.
2. Il repère ainsi d'un coup d'œil ce qui lui incombe au milieu du planning collectif.

### Vues disponibles

Trois vues, exclusives, choisies par une bascule :

- **Semaine** *(nouvelle, vue par défaut)* — tableau salles × jours, lundi → dimanche.
- **Mois** — le calendrier mensuel existant, rendu **multi-salles** : il n'impose plus de
  choisir une salle, et indique pour chaque réservation la salle concernée.
- **Liste** — la liste existante et ses filtres, inchangée.

Dans les deux vues calendaires, le choix d'une salle devient un **filtre facultatif**
(« Toutes les salles » par défaut) et non plus une sélection obligatoire.

### Scénarios alternatifs / cas limites

- **Si l'utilisateur n'a aucune réservation à venir**, l'encart « Mes réservations » ne
  s'affiche pas : il n'occupe pas d'espace pour ne rien dire.
- **Si l'église n'a aucune salle**, les vues calendaires affichent un message explicite
  plutôt qu'une grille vide.
- **Si une salle n'a aucune réservation de la semaine affichée**, sa ligne reste visible
  et entièrement vide — c'est précisément l'information utile (« cette salle est libre »).
- **Si une salle a été désactivée** alors qu'elle porte encore une réservation dans la
  période affichée, sa ligne reste présente pour que cette réservation ne disparaisse pas
  du planning. Une salle désactivée **sans** réservation sur la période n'apparaît pas.
- **Si une même salle a plusieurs réservations le même jour**, elles apparaissent toutes
  dans la case, **triées par heure de début**.
- **Quand une réservation commence tard le soir**, elle apparaît au **jour local** de son
  début, jamais la veille — y compris en heure d'été comme en heure d'hiver.
- **Quand une réservation chevauche deux jours** (commence un soir, finit après minuit),
  elle est rattachée au **jour de son début**.
- **Quand la semaine affichée est à cheval sur deux mois**, la période affichée le
  mentionne clairement.
- **Quand une réservation est annulée**, elle disparaît des grilles et de l'encart, comme
  aujourd'hui de la liste.
- **Quand une salle appartient à une autre église** et est partagée avec l'église
  courante, son origine reste identifiable dans la grille comme elle l'est aujourd'hui
  dans la liste déroulante.
- **Quand l'utilisateur consulte depuis un téléphone**, la grille reste exploitable : le
  contenu peut défiler horizontalement, l'identité de la salle restant lisible.
- **Quand la semaine affichée est la semaine en cours**, le jour du jour est mis en
  évidence.

## Critères d'acceptation

- [ ] La page Salles s'ouvre par défaut sur la **vue semaine**.
- [ ] La vue semaine affiche **sept colonnes**, du lundi au dimanche, et **une ligne par
      salle active**, à laquelle s'ajoute toute salle désactivée portant une réservation
      dans la période affichée.
- [ ] Chaque case affiche **toutes** les réservations confirmées de cette salle ce jour-là,
      avec heure de début et titre, **triées par heure de début**.
- [ ] Aucune sélection de salle n'est requise pour voir la grille : **toutes les salles**
      sont affichées par défaut.
- [ ] Un filtre facultatif permet de restreindre les grilles à une salle ; « Toutes les
      salles » est la valeur par défaut.
- [ ] Les flèches de navigation déplacent la période d'**une semaine** en vue semaine,
      d'**un mois** en vue mois ; la période courante est affichée en toutes lettres.
- [ ] Le calendrier mensuel affiche les réservations de **toutes** les salles (plus de
      sélecteur obligatoire) et permet d'identifier la salle de chaque réservation.
- [ ] Une bascule permet de passer entre **Semaine**, **Mois** et **Liste**.
- [ ] Dans la grille semaine et dans le calendrier mensuel, les réservations **de
      l'utilisateur courant** sont visuellement distinctes de celles des autres.
- [ ] Cliquer sur une réservation dans une grille ouvre son **détail** (salle, horaires,
      auteur, état de la main courante) avec les actions auxquelles l'utilisateur a droit.
- [ ] L'encart **« Mes réservations »** est affiché **au-dessus** de la bascule de vue et
      reste visible en vue semaine, mois **et** liste.
- [ ] L'encart liste uniquement les réservations **non terminées** de l'utilisateur
      courant, par ordre chronologique, et en affiche **au plus 4**.
- [ ] Le contenu de l'encart **ne varie pas** quand l'utilisateur change de vue ou modifie
      les filtres de la vue courante.
- [ ] L'encart propose **« Déclarer l'ouverture »** pour une réservation dont la main
      courante n'est pas ouverte, et **« Déclarer la fermeture »** pour une réservation
      ouverte — jamais les deux à la fois, jamais une action que le serveur refuserait.
- [ ] L'encart affiche pour chaque réservation son **état de main courante**.
- [ ] L'encart est **repliable** et **dépliable**.
- [ ] Quand l'utilisateur a plus de 4 réservations à venir, un lien donne accès à la
      **totalité de ses réservations**.
- [ ] L'encart ne propose **pas** l'annulation d'une réservation ; celle-ci reste dans le
      détail, derrière sa confirmation.
- [ ] Quand l'utilisateur n'a **aucune** réservation à venir, l'encart n'est pas affiché.
- [ ] Une réservation dont l'heure de début est **tard le soir** apparaît au **jour local**
      de son début dans les deux vues calendaires — vérifiable en heure d'été comme en
      heure d'hiver.
- [ ] Sur mobile, la grille semaine reste consultable sans que la mise en page de la page
      déborde horizontalement.
- [ ] Aucune réservation d'une **autre église** n'apparaît, dans aucune vue.
- [ ] Un **Secrétaire** consulte les trois vues sans qu'aucune action de réservation ou de
      déclaration ne lui soit proposée.

## Hors périmètre

- **Toute modification des droits** du module salles : les permissions `rooms:view`,
  `rooms:reserve`, `rooms:manage` et l'exclusion du STAR (spec 031) restent inchangées.
- **La création ou la modification d'une réservation depuis la grille** (glisser-déposer,
  clic sur une case vide pour pré-remplir le formulaire, redimensionnement) : la création
  reste le bouton et le formulaire existants.
- **L'affichage à l'heure près** dans la grille (bandeaux positionnés sur un axe horaire,
  visualisation des chevauchements) : la case reste une liste de réservations du jour.
- **Une vue « jour »** dédiée.
- **La détection ou la signalisation visuelle des conflits** entre réservations : elle
  reste assurée au moment de la création, côté serveur, comme aujourd'hui.
- **La page de contrôle des mains courantes** (`Contrôle des mains courantes`) et le
  parcours de validation par l'équipe dédiée.
- **Les écrans d'administration** des salles.
- **L'export** ou l'impression des grilles.
- **La mémorisation** de la vue, de la période ou du filtre entre deux chargements de la
  page.
- **Toute évolution du modèle de données** ou des échanges avec le serveur : la feature se
  contente de réorganiser des informations déjà disponibles.

## Questions ouvertes

*Toutes tranchées le 2026-08-30 :*

- **Salles affichées en ligne** → les salles **actives**, **plus** toute salle désactivée
  portant une réservation dans la période affichée. Motif : désactiver une salle ne doit
  jamais faire disparaître du planning une réservation déjà posée dessus.
- **Horizon de l'encart « Mes réservations »** → **toutes** les réservations non terminées,
  sans borne dans le futur ; **4 lignes** affichées, le reste derrière le lien vers la
  liste complète.
- **Annulation depuis l'encart** → **non**. L'encart porte les déclarations d'ouverture et
  de fermeture, et l'accès au détail. L'annulation, irréversible, reste dans le détail
  derrière sa confirmation.
- **Volumétrie** → moins de **10 salles**. La grille tient sans regroupement ni pagination ;
  aucun aménagement particulier à prévoir au-delà d'un en-tête de colonnes lisible.

---

*Étape suivante : `/plan`.*
