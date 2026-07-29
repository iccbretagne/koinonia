# Spec — Filtre « mes réservations », vue de la main courante et champs multi-lignes

- **Numéro** : 011
- **Statut** : Implémentée
- **Créée le** : 2026-07-29
- **Branche suggérée** : `feat/gestion-reservation-salles` (poursuite des features 008/009/010, non mergée)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Plusieurs manques ergonomiques persistent dans le module de réservation de salles après les
itérations 008/009/010 :

- La vue liste des réservations permet déjà de filtrer par salle et par statut de main courante
  (010), mais pas de retrouver rapidement ses propres réservations parmi celles de toute l'église
  — utile en particulier pour un utilisateur qui gère régulièrement plusieurs réservations.
- Plusieurs champs de saisie libre du module (notes d'ouverture/fermeture, description d'un
  problème de matériel ou d'état des lieux, écart constaté lors d'un contrôle ou d'un
  signalement) sont des champs sur une seule ligne. Ces informations sont parfois plus longues
  qu'une ligne (ex. décrire précisément un dégât constaté), ce qui rend la saisie inconfortable et
  le texte saisi difficile à relire.
- Il n'existe aujourd'hui aucun moyen de **consulter** le détail complet d'une main courante
  (heures d'ouverture/fermeture, provenance/destination des clés, état des lieux/matériel, notes,
  résultat du contrôle) en dehors des écrans d'action ponctuelle — le détail d'une réservation
  affiche seulement un badge de statut, et le tableau de contrôle n'ouvre un écran de détail que
  pour les fermetures déclarées en attente de contrôle (« Contrôler »). Une main courante déjà
  validée, en écart, ou pas encore ouverte n'a donc aucun écran où en consulter le détail.
- Le tableau de contrôle des mains courantes ne permet de filtrer que par salle et par statut
  (010) ; retrouver une main courante par date ou par responsable (créateur de la réservation)
  demande de parcourir toute la liste.
- La page du tableau de contrôle des mains courantes n'offre aucun moyen explicite de revenir à
  la page de réservation des salles, alors que l'inverse existe déjà (lien « Contrôle des mains
  courantes » depuis la page de réservation) — l'utilisateur doit dépendre de la navigation du
  navigateur pour revenir en arrière.

## Utilisateurs concernés

- **STAR / Resp. département / Ministre / Secrétaire / Admin / Super Admin** : consultent la vue
  liste des réservations, bénéficient du filtre « mes réservations ».
- **STAR / Resp. département / Ministre** (créateurs de réservation) : saisissent les notes
  d'ouverture/fermeture et la description d'un problème de matériel.
- **Équipe dédiée (sécurité / entretien)** : saisit un écart constaté lors d'un contrôle ou d'un
  signalement sans déclaration préalable, consulte le détail complet de n'importe quelle main
  courante depuis le tableau de contrôle, et y retrouve une réservation par date ou par
  responsable en plus de la salle et du statut.
- **STAR / Resp. département / Ministre / Secrétaire / Admin / Super Admin** : consultent le
  détail complet d'une main courante depuis le détail d'une réservation (calendrier), quel que
  soit son statut.

## Comportement attendu

### Scénario principal

1. Un utilisateur consulte la vue liste des réservations et active le filtre « mes réservations » :
   seules les réservations qu'il a lui-même créées restent affichées, combinables avec les filtres
   salle/statut de main courante déjà existants.
2. Lorsqu'un utilisateur saisit une note d'ouverture, de fermeture, une description de problème de
   matériel, ou qu'un membre de l'équipe dédiée saisit un écart constaté, le champ de saisie
   accepte et affiche plusieurs lignes de texte (retour à la ligne, texte plus long visible sans
   défilement horizontal).
3. Un utilisateur ouvre le détail d'une réservation depuis le calendrier : au-delà du statut de
   la main courante déjà affiché, il voit le détail complet de ce qui a été déclaré et contrôlé
   (heures, clés, état des lieux/matériel, notes), quel que soit le statut — y compris si rien
   n'a encore été déclaré.
4. Un membre de l'équipe dédiée clique sur une réservation dans le tableau de contrôle, même
   lorsqu'aucune action n'est proposée pour son statut actuel (ex. déjà validée) : le détail
   complet de sa main courante s'affiche.
5. Ce même membre filtre le tableau de contrôle par date et par responsable, en plus des filtres
   salle et statut déjà existants, pour retrouver rapidement une main courante précise.
6. Depuis la page du tableau de contrôle, un bouton permet de revenir explicitement à la page de
   réservation des salles.

### Scénarios alternatifs / cas limites

- **Si** le filtre « mes réservations » est actif et qu'aucune réservation de l'utilisateur ne
  correspond aux autres filtres appliqués, **alors** la liste vide s'affiche normalement.
- **Si** le filtre « mes réservations » est désactivé, **alors** les réservations de toute
  l'église réapparaissent (comportement actuel inchangé).
- **Quand** un texte déjà saisi sur une seule ligne existe pour une réservation passée, **alors**
  il continue de s'afficher normalement dans un champ multi-lignes (aucune perte de données).
- **Si** aucune ouverture ni fermeture n'a été déclarée pour une réservation, **alors** le détail
  de sa main courante l'indique clairement (champs « non renseigné »), sans erreur.
- **Si** aucune main courante ne correspond aux filtres de date/responsable appliqués sur le
  tableau de contrôle, **alors** la liste vide s'affiche normalement.

Cette itération ajoute plusieurs contrôles (filtres, boutons, détail) aux vues existantes du
module ; ils doivent rester utilisables sur mobile au même niveau que le reste de l'application
(pas de contrôle inaccessible, illisible, ou nécessitant un défilement horizontal sur petit écran).

## Critères d'acceptation

- [x] La vue liste des réservations propose un filtre « mes réservations », combinable avec les
      filtres salle et statut de main courante existants.
- [x] Le champ de notes d'ouverture d'une réservation accepte la saisie multi-lignes.
- [x] Le champ de notes de fermeture d'une réservation accepte la saisie multi-lignes.
- [x] Le champ de description d'un problème de matériel/état des lieux accepte la saisie
      multi-lignes.
- [x] Le champ de saisie d'un écart lors d'un contrôle (fermeture déjà déclarée) accepte la
      saisie multi-lignes.
- [x] Le champ de saisie d'un écart ou de notes lors d'une action de suivi sans déclaration
      préalable (signaler un écart / clôturer sans déclaration) accepte la saisie multi-lignes.
- [x] Le détail d'une réservation ouvert depuis le calendrier affiche le détail complet de sa
      main courante (heures, clés, état des lieux/matériel, notes, résultat du contrôle), quel
      que soit son statut, y compris « non renseigné » si rien n'a été déclaré.
- [x] Cliquer sur une réservation dans le tableau de contrôle affiche le détail complet de sa
      main courante, même quand aucune action n'est disponible pour son statut actuel.
- [x] Le tableau de contrôle des mains courantes peut être filtré par date (ou période) et par
      responsable (créateur de la réservation), en plus des filtres salle et statut existants.
- [x] La page du tableau de contrôle des mains courantes propose un bouton explicite pour revenir
      à la page de réservation des salles.
- [x] Tous les éléments ajoutés par cette spec (filtres, boutons, détail de la main courante)
      restent utilisables sur mobile, au même niveau d'ergonomie que le reste du module.

## Hors périmètre

- Toute règle métier déjà tranchée dans les spécifications 008/009/010 (disponibilité,
  récurrence, contenu de la main courante, actions de suivi, filtres/tri déjà livrés).
- Le champ de recherche/autocomplétion des personnes pour la remise des clés (courte saisie d'un
  nom, pas concernée par le passage en multi-lignes).
- Le titre d'une réservation et les autres champs courts par nature (nom, capacité, lieu d'une
  salle...).

## Questions ouvertes

Aucune question bloquante restante.
