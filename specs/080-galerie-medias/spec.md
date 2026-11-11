# Spec — Galerie médias

- **Numéro** : 080
- **Statut** : Implémentée
- **Créée le** : 2026-11-11
- **Branche suggérée** : `feat/galerie-medias`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

L'espace « Communication & Production » range les médias **par conteneur** : les photos
événement par événement, les visuels projet par projet. Pour retrouver « la photo du baptême de
mars » ou « tous les visuels de l'année », il faut ouvrir les événements un à un, ou créer un
lien de partage (galerie, collection) — qui expire, se renouvelle et se gère à la main.

Les équipes qui produisent et diffusent ces médias (Photos, Production Média, Communication)
n'ont donc aucune **vue d'ensemble** de ce qui existe. Et il n'y a aucun moyen simple d'ouvrir
cette vue à une personne précise (un pasteur, un responsable qui prépare une présentation) sans
lui envoyer un lien.

La galerie offre un lieu unique, dans l'application, pour **parcourir, filtrer, retrouver et
reprendre** tous les médias validés de l'église, avec un accès nominatif qu'on donne et qu'on
retire sans lien à entretenir.

## Utilisateurs concernés

| Qui | Ce qu'il peut faire |
|---|---|
| **Super Admin, Admin, Secrétaire** | Parcourir la galerie, télécharger, partager une sélection (selon leurs droits de partage actuels) |
| **Membres des équipes Photos, Production Média, Communication** | Parcourir la galerie, télécharger, partager une sélection si leur équipe a déjà ce droit aujourd'hui |
| **Ministre de chaque ministère qui porte l'une de ces équipes** (« Ministre de la communication » ; s'il y en a plusieurs, chacun) | Parcourir la galerie ; **donner et retirer un accès nominatif** |
| **Admin** (et Super Admin) | **Donner et retirer un accès nominatif** |
| **Personne ayant un accès nominatif** (n'importe quel compte de l'église : Ministre, Resp. département, STAR…) | Parcourir la galerie et télécharger, **en lecture seule** : parcourir et télécharger (haute définition et archive), ni partage, ni modification |
| **Tous les autres** | Aucun accès : la carte n'apparaît pas, l'adresse directe est refusée |

## Comportement attendu

### Scénario principal — retrouver et reprendre des médias

1. Une membre de l'équipe Communication ouvre l'espace « Communication & Production ». À côté
   des cartes Photos, Visuels et Réseaux sociaux, une carte **Galerie** affiche le nombre de
   médias disponibles.
2. La galerie s'ouvre sur une **grille de vignettes**, la plus récente en haut, regroupée par
   mois (« Novembre 2026 », « Octobre 2026 »…). Les vignettes suivantes se chargent au
   défilement, sans pagination.
3. Elle filtre : **Photos** seulement, période « mars 2026 », événement « Baptêmes ». La grille
   se met à jour ; le nombre de résultats est affiché ; les filtres actifs apparaissent en
   pastilles qu'on retire d'un geste.
4. Elle touche une photo : la **visionneuse** s'ouvre en plein écran. Elle passe à la suivante
   en glissant (ou avec les flèches au clavier), voit le nom, la date et l'origine, télécharge
   la photo en haute définition, ou suit « Voir dans l'événement ».
5. De retour à la grille, elle passe en **sélection**, coche douze photos et choisit
   « Télécharger » (une archive) ou « Partager une sélection » (le partage existant, avec ses
   règles actuelles).
6. Elle copie l'adresse de la page : un collègue qui l'ouvre retrouve les mêmes filtres.

### Scénario — accès nominatif

1. Le Ministre de la communication ouvre la gestion des accès de la galerie et ajoute
   « Pasteur X », avec une date de fin au 31 décembre (facultative).
2. Le pasteur reçoit une notification « Vous avez accès à la galerie médias » avec le lien.
3. Dans son menu, l'espace « Communication & Production » apparaît avec **la seule carte
   Galerie**. Il parcourt et télécharge (photo en haute définition ou sélection en archive),
   sans bouton de partage.
4. Le 1er janvier, son accès s'éteint : la carte disparaît, l'adresse directe est refusée.
5. Un Admin peut retirer l'accès avant la date ; l'ajout, la modification et le retrait sont
   journalisés (qui, pour qui, quand).

### Ce qui apparaît dans la galerie

- **Photos** approuvées, quel que soit l'événement (y compris archivé).
- **Visuels** validés (approuvés, ou approuvés définitivement — la même définition que les
  liens de partage), quel que soit le projet ou l'événement, dans leur **dernière version**.
- Jamais : une photo en attente, pré-validée, écartée ou rejetée ; un visuel en brouillon, en
  révision ou rejeté. Ces médias restent dans les écrans de l'événement ou du projet.
- Un média supprimé, ou dont l'événement ou le projet est supprimé, disparaît de la galerie.

### Filtres et tri

- **Type** : Tous, Photos, Visuels.
- **Période** : mois ou intervalle de dates.
- **Événement ou projet** : liste avec recherche.
- **Recherche** par nom (de fichier, d'événement, de projet).
- **Tri** : plus récent d'abord (par défaut) ou plus ancien d'abord. La date d'une photo est
  celle de son événement ; celle d'un visuel, la date de **dépôt** de sa dernière version.

### Scénarios alternatifs / cas limites

- **Aucun résultat** : un message l'indique et propose d'effacer les filtres.
- **Galerie vide** (aucun média validé) : un message explique que les médias apparaissent ici
  une fois validés.
- **Une personne quitte l'équipe** : son accès d'équipe disparaît aussitôt ; un accès nominatif
  éventuel, lui, reste valable jusqu'à sa date de fin ou son retrait.
- **Une personne a un accès nominatif et rejoint l'équipe** : elle obtient les droits de
  l'équipe ; l'accès nominatif reste listé et peut être retiré sans effet sur ses droits d'équipe.
- **Accès nominatif à un compte d'une autre église** : impossible, la recherche ne propose que
  les comptes de l'église.
- **Ministre d'un autre ministère** : ne voit ni la galerie ni la gestion des accès.
- **Sélection très large** pour l'archive : une limite de taille s'applique, annoncée avant le
  lancement ; au-delà, l'utilisateur est invité à réduire la sélection.
- **Téléphone** : grille sur 3 colonnes, visionneuse au doigt, barre de sélection en bas ;
  tout reste utilisable d'une main.
- **Thème sombre** : la galerie suit le thème choisi ; la visionneuse est toujours sur fond
  sombre, comme les visionneuses existantes.

## Critères d'acceptation

- [ ] La carte Galerie apparaît dans l'espace Communication & Production pour les équipes
      Photos, Production Média, Communication, leur Ministre, Admin, Secrétaire, Super Admin et
      les personnes ayant un accès nominatif valide — et pour personne d'autre.
- [ ] L'adresse directe de la galerie est refusée à toute personne sans droit.
- [ ] La galerie ne montre que les photos approuvées et les visuels validés (approuvés ou approuvés définitivement)
      (dernière version) de l'église courante.
- [ ] La grille est regroupée par mois, triable par date dans les deux sens, et se charge au
      défilement.
- [ ] Les filtres type, période, événement/projet et recherche se combinent, et sont conservés
      dans l'adresse de la page.
- [ ] La visionneuse permet de passer d'un média à l'autre, de télécharger en haute définition
      et de rejoindre l'événement ou le projet d'origine (si l'utilisateur y a accès).
- [ ] La sélection multiple permet de télécharger une archive ; « Partager une sélection » n'est
      proposé qu'à ceux qui ont déjà le droit de partager.
- [ ] Un Admin ou un Ministre d'un ministère portant l'une des équipes donne et retire un accès nominatif, avec une
      date de fin facultative ; la personne est notifiée à l'ajout.
- [ ] Un accès nominatif est en lecture seule (parcourir, télécharger en haute définition et en
      archive, sans partage) et s'éteint à sa date de fin.
- [ ] Ajout, modification et retrait d'un accès nominatif sont journalisés.
- [ ] La galerie respecte la charte (couleurs du design system, thème clair et sombre) et est
      utilisable sur téléphone.
- [ ] Les écrans existants (Photos, Visuels, partages) fonctionnent comme avant.

## Hors périmètre

- Étiquettes, mots-clés, albums thématiques.
- Vidéos.
- Modification d'un média depuis la galerie (renommer, supprimer, changer le statut).
- Reconnaissance des visages ou recherche par contenu de l'image.
- Accès sans compte (les liens de partage existants remplissent ce rôle).
- Accès nominatif limité à certains événements ou à une période.

## Questions ouvertes

Tranchées le 2026-11-11 :

- Date d'un visuel pour le tri et les filtres : date de **dépôt** de sa dernière version.
- Équipes réparties dans plusieurs ministères : **chacun** de leurs Ministres donne l'accès.
- Visuels : « validés » = approuvés **ou** approuvés définitivement, comme les partages.
- Accès nominatif : **téléchargement** autorisé (haute définition et archive), sans partage.
