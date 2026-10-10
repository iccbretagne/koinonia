# Spec — Refonte de l'écran Offres

- **Numéro** : 064
- **Statut** : Implémentée
- **Créée le** : 2026-10-10
- **Branche suggérée** : `feat/offres`
- **Issue** : #678
- **Démo** : https://claude.ai/artifact/RWSfBZKma23devUyAaqm7t (onglet « Offres », case « Vue modération »)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'espace « Offres » met en relation les membres de la communauté autour du travail. On y trouve
quatre sortes de publications :

- les **offres** d'emploi, de stage ou d'alternance ;
- les **missions freelance** à confier ;
- les **profils en recherche** d'emploi, de stage ou d'alternance ;
- les **profils freelance** de personnes qui proposent leurs services.

L'écran a grossi par ajouts successifs et n'a pas été repris par la refonte du design system
(spec 055). Les retours et une revue de l'écran font apparaître sept problèmes :

1. **Deux noms pour le même espace.** Le menu dit « Offres », la page dit « Emploi ».
2. **Jusqu'à trois niveaux d'onglets.** Offres / En recherche / Freelance, puis Tout / Emploi /
   Stage / Alternance, puis, pour les modérateurs, Tout / Publiées / Retirées. L'onglet
   « Freelance » mélange les missions à confier et les personnes disponibles, c'est-à-dire ce
   que l'on cherche et ce que l'on propose.
3. **Un bouton de publication qui change selon l'onglet.** « Publier une offre », « Publier mon
   profil », puis deux boutons côte à côte sur « Freelance » (« Proposer une mission »,
   « Proposer mes services ») : ils débordent de l'écran sur mobile.
4. **Une action cachée dans la carte.** Pour un modérateur, le bouton « Retirer » ou
   « Republier » se trouve à l'intérieur de la carte, qui est elle-même un lien vers le détail.
   Un clic mal placé ouvre le détail au lieu de retirer, et les lecteurs d'écran annoncent mal
   ces deux actions imbriquées.
5. **Ni recherche ni « Mes publications ».** Pour retrouver une offre ou sa propre annonce, il
   faut faire défiler toute la liste.
6. **Un état vide trompeur.** « Aucune offre pour le moment, soyez le premier à publier ! »
   s'affiche aussi quand des offres existent mais qu'aucune ne correspond au filtre choisi.
7. **Hors design system.** Icônes dessinées à la main, onglets et pastilles propres à l'écran,
   alertes du navigateur en cas d'erreur, cibles tactiles trop petites.

## Utilisateurs concernés

L'espace est **commun à toute la plateforme**, pas propre à une église : tous les rôles le
consultent et y publient (Super Admin, Admin, Secrétaire, Ministre, Resp. département, Faiseur
de Disciples, Reporter, STAR, Référent soins pastoraux, Comptable). La refonte ne change aucun
droit :

- **Tout utilisateur** consulte les publications actives, publie des quatre types, et modifie,
  retire ou supprime ses propres publications.
- **Modérateurs** (Super Admin, Admin, Secrétaire) : voient aussi les publications retirées,
  pourvues, expirées ou indisponibles, et peuvent retirer, republier ou supprimer celles des
  autres.

## Comportement attendu

### Vocabulaire

- **Opportunité** : ce que l'on propose à quelqu'un d'autre, c'est-à-dire une offre d'emploi,
  de stage ou d'alternance, ou une mission freelance.
- **Profil disponible** : une personne qui se rend disponible, c'est-à-dire un profil en
  recherche d'emploi, de stage ou d'alternance, ou un profil freelance.
- **Publication active** : une offre publiée et non expirée, une mission non pourvue, une
  personne toujours en recherche ou un profil freelance disponible.

### Scénario principal — trouver une opportunité

1. Marie, STAR, ouvre « Offres » depuis le menu. La page porte le même nom que l'entrée de menu.
2. Elle arrive sur l'onglet **« Opportunités »**. Deux onglets seulement, « Opportunités » et
   « Profils disponibles », chacun avec son nombre de publications actives.
3. La liste montre les opportunités actives, de la plus récente à la plus ancienne. Chaque
   carte affiche :
   - le type (« Emploi », « Stage », « Alternance » ou « Mission ») ;
   - le titre, l'entreprise ou le domaine, et le lieu ;
   - le tarif ou le budget pour une mission ;
   - l'échéance relative (« Expire dans 5 j »), mise en évidence à moins de 7 jours ;
   - un repère **« Nouveau »** si la publication est parue depuis sa dernière visite.
4. Des pastilles de type, « Emploi », « Stage », « Alternance » et « Mission », filtrent la
   liste. Elle en active une ou plusieurs ; aucune pastille active veut dire tous les types.
5. Elle tape « comptable » dans la recherche : la liste ne garde que les publications dont le
   titre, l'entreprise ou le domaine, le lieu ou la description contiennent ce mot, sans tenir
   compte des accents ni des majuscules. La recherche se combine avec les pastilles.
6. Elle touche une carte. Le **détail** s'ouvre sans quitter la liste : dans un panneau à côté
   d'elle sur grand écran, dans une feuille depuis le bas de l'écran sur mobile. On y trouve la
   description complète, durée, date limite, auteur et date de publication, et le moyen de
   candidater (« Écrire à l'auteur » par email, « Postuler en ligne » vers le lien fourni).
7. La carte elle-même ne porte aucun bouton : toutes les actions sont dans le détail.

### Scénario — publier

1. Jean veut proposer ses services. Un seul bouton **« Publier »** figure en haut de l'écran,
   quel que soit l'onglet.
2. Le bouton ouvre un choix entre quatre types, chacun avec une phrase d'explication : « Une
   offre d'emploi, de stage ou d'alternance », « Une mission freelance », « Mon profil de
   recherche d'emploi », « Mes services de freelance ». Sur mobile, ce choix s'ouvre en feuille
   depuis le bas de l'écran.
3. Il choisit « Mes services de freelance » et arrive sur le formulaire existant, qui ne change
   pas.
4. Une fois la publication enregistrée, elle apparaît dans « Profils disponibles ».

### Scénario — retrouver ses publications

1. Jean active la pastille **« Mes publications »**. La liste de l'onglet ne garde que ce qu'il
   a publié.
2. Il y retrouve aussi ses publications retirées, pourvues ou expirées, avec leur état bien
   visible (« Retirée », « Pourvue », « Expirée »…), pour pouvoir les republier ou les supprimer.
   Hors de « Mes publications », un utilisateur qui n'est pas modérateur ne voit que les
   publications actives, comme aujourd'hui.
3. Depuis le détail de l'une d'elles, il dispose de « Modifier », « Retirer » ou « Republier »
   et « Supprimer ».

### Scénario — diffuser sur WhatsApp

1. La Secrétaire filtre « Stage » et touche **« Copier pour WhatsApp »**, placé dans la barre
   d'outils au-dessus de la liste.
2. Le message reprend les offres affichées, filtres et recherche compris, avec pour chacune un
   lien qui ouvre directement son détail.
3. Une confirmation indique combien de publications ont été copiées. Si la copie automatique
   échoue, le texte s'affiche pour être copié à la main, comme aujourd'hui.
4. Le bouton n'apparaît que sur « Opportunités » et seulement quand la liste n'est pas vide.

### Scénario — modérer

1. Un Admin ouvre « Offres ». En plus des filtres habituels, il dispose d'un filtre d'**état**
   (« Actives » par défaut, « Retirées », « Toutes »). Les publications pourvues, expirées ou
   indisponibles rejoignent les retirées dans « Retirées ». Il n'y a pas de vue de modération à
   part.
2. Chaque publication qui n'est pas active porte son état sur sa carte.
3. Il ouvre une offre douteuse et touche **« Retirer »** dans le détail. Une confirmation
   apparaît, puis la publication disparaît des listes des autres utilisateurs.
4. Depuis une publication retirée, **« Republier »** la remet en ligne.
5. Les erreurs (publication supprimée entre-temps, refus) s'affichent dans l'écran, jamais
   dans une fenêtre d'alerte du navigateur.

### Scénarios alternatifs / cas limites

- **Aucun résultat pour les filtres.** Quand des publications existent mais qu'aucune ne
  correspond à la recherche, aux pastilles ou à « Mes publications », l'écran affiche « Aucun
  résultat pour ces filtres » avec un bouton **« Effacer les filtres »**, qui vide la recherche
  et désactive toutes les pastilles.
- **Onglet réellement vide.** Quand aucune publication active n'existe dans l'onglet, l'écran
  invite à publier, avec le choix adapté à l'onglet : une opportunité sur « Opportunités », un
  profil sur « Profils disponibles ».
- **Profils disponibles.** Les pastilles de type sont « Emploi », « Stage », « Alternance » et
  « Freelance ». Un profil en recherche qui vise plusieurs types de contrat apparaît dès qu'un
  de ses types est actif. La carte montre le poste recherché, le secteur ou le domaine, le lieu
  (avec la mention télétravail le cas échéant), la date de disponibilité et, pour un freelance,
  son tarif.
- **Échéance.** Seules les offres d'emploi, de stage ou d'alternance ont une date limite. Les
  autres publications n'affichent pas d'échéance. Une offre dont la date limite est passée
  n'apparaît plus qu'à son auteur, dans « Mes publications », et aux modérateurs, avec la mention
  « Expirée ».
- **Repère « Nouveau ».** Il porte sur les **opportunités** (offres et missions) d'autres
  personnes parues depuis la dernière visite de l'espace, jamais sur les siennes ni sur les
  profils. La pastille du menu compte les mêmes publications : elle inclut désormais les
  missions freelance. Le repère reste affiché pendant la visite au cours de laquelle on les
  découvre, même si la pastille du menu se remet à zéro dès l'ouverture de l'écran.
- **Lien partagé.** Un lien vers une publication, reçu par exemple dans un message WhatsApp,
  ouvre toujours son détail, que l'on soit déjà dans l'application ou non, sur une page à part
  qui présente le même contenu et les mêmes actions que le panneau, avec un retour vers
  « Offres ». Si la publication a
  été retirée ou supprimée, un message l'indique, avec un retour vers « Offres ».
- **Onglet dans l'adresse.** L'onglet affiché fait partie de l'adresse de la page : recharger ou
  partager l'adresse rouvre le même onglet. Une ancienne adresse vers l'onglet « En recherche »
  ou « Freelance » ouvre l'onglet correspondant de la nouvelle organisation (« Profils
  disponibles » pour « En recherche », « Opportunités » filtrées sur « Mission » pour
  « Freelance »).
- **Mobile (360 px).** Pas de défilement horizontal. Les onglets, les pastilles, la recherche,
  « Publier » et « Copier pour WhatsApp » tiennent sans déborder, en passant à la ligne si
  besoin. Chaque cible tactile mesure au moins 44 px.

## Critères d'acceptation

- [ ] Le menu, le titre de la page et le fil d'Ariane portent le même nom, « Offres ».
- [ ] L'écran a exactement deux onglets, « Opportunités » et « Profils disponibles », chacun
      avec son nombre de publications actives, et aucun second niveau d'onglets.
- [ ] « Opportunités » regroupe offres d'emploi, de stage, d'alternance et missions freelance ;
      « Profils disponibles » regroupe profils en recherche et profils freelance.
- [ ] Les types se filtrent par pastilles combinables, et ces pastilles se combinent avec la
      recherche et « Mes publications ».
- [ ] La recherche porte sur le titre, l'entreprise ou le domaine, le lieu et la description,
      sans tenir compte des accents ni des majuscules.
- [ ] Un seul bouton « Publier », identique sur les deux onglets, ouvre un choix entre les
      quatre types, en feuille du bas sur mobile, et mène aux formulaires existants.
- [ ] « Mes publications » ne montre que les publications de l'utilisateur, y compris celles qui
      ne sont plus actives, avec leur état.
- [ ] Aucune carte ne contient de bouton ou de lien autre que la carte elle-même. Modifier,
      retirer, republier et supprimer se font depuis le détail.
- [ ] Les publications non actives ne sont visibles que des modérateurs et de leur auteur.
- [ ] Les modérateurs filtrent par état (actives, retirées, toutes) et voient l'état sur chaque
      carte non active.
- [ ] Retirer et supprimer demandent une confirmation dans l'interface. Aucune fenêtre
      d'alerte ou de confirmation du navigateur ne subsiste dans l'espace.
- [ ] Une offre affiche son échéance relative, mise en évidence à moins de 7 jours.
- [ ] Une mission et un profil freelance affichent leur tarif ou leur budget sur la carte.
- [ ] Le détail s'ouvre en panneau depuis la liste (feuille du bas sur mobile) ; la page de
      détail d'un lien direct présente le même contenu et les mêmes actions.
- [ ] Une opportunité d'autrui parue depuis la dernière visite porte le repère « Nouveau », et
      la pastille du menu compte les offres et les missions parues depuis cette visite.
- [ ] Sans résultat pour les filtres, l'écran affiche « Aucun résultat pour ces filtres » et
      « Effacer les filtres », distinct de l'état « rien de publié ».
- [ ] « Copier pour WhatsApp » se trouve dans la barre d'outils d'« Opportunités » et copie les
      opportunités affichées, avec un lien vers chacune.
- [ ] Un lien direct vers une publication ouvre son détail ; les anciennes adresses d'onglet
      mènent au bon onglet.
- [ ] À 360 px de large : aucun défilement horizontal, aucun bouton qui déborde, cibles d'au
      moins 44 px.
- [ ] L'écran utilise les icônes, onglets, pastilles, étiquettes d'état, états vides et
      couleurs du design system.
- [ ] Les droits sont inchangés : qui peut voir, publier, modifier, retirer et supprimer reste
      identique.

## Hors périmètre

- Les **formulaires** de publication et d'édition des quatre types : ni leurs champs ni leur
  présentation ne changent, au-delà de l'accès par le bouton « Publier ».
- Toute **nouvelle règle de modération** : signalement d'une publication par un membre,
  expiration automatique des profils ou des missions, file de modération dédiée (voir Q2).
- Les **notifications** et alertes de nouvelles offres (réglages existants inchangés).
- La **candidature dans l'application** : candidater reste un email ou un lien externe.
- Toute modification des **droits** du module.

## Décisions (2026-10-10)

| Question | Décision |
|---|---|
| Nom de l'espace | **« Offres »**, déjà utilisé par le menu. |
| Q1 — Forme du détail | **Panneau** depuis la liste (feuille du bas sur mobile), et **page de détail conservée** pour les liens directs, avec le même contenu et les mêmes actions. |
| Q2 — Vue dédiée à la modération | **Non** dans ce lot : un filtre d'état (Actives, Retirées, Toutes) suffit, faute de signalement par les membres pour alimenter une file. |
| Q3 — Publications non actives de l'auteur | **Visibles dans « Mes publications »**, avec leur état, pour pouvoir les republier ou les supprimer. |
| Q4 — « Nouveau » et pastille du menu | **Toutes les opportunités** (offres et missions) ; les nouveaux profils ne sont pas signalés. |
