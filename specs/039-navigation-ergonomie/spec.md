# Spec — Ergonomie de la navigation : libellé de gestion des événements et place de la Comptabilité

- **Numéro** : 039
- **Statut** : Implémentée
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/navigation-ergonomie`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Deux retours de recette sur le menu principal, tous deux de repérage :

1. **« Gestion » ne dit pas ce qu'il gère.** Dans la section *Événements* du menu, l'entrée qui
   ouvre la création et la configuration des événements (créer un événement, régler ses
   départements, sa récurrence, son compte rendu…) s'intitule seulement « Gestion ». Le
   Secrétariat, principal utilisateur de cette page, ne la repère pas : rien n'indique qu'on y
   crée des événements, par opposition à *Liste* et *Calendrier* qui les consultent.
   Le mot est en outre employé **deux fois** dans le menu : la section *Opérations* contient
   elle aussi une entrée « Gestion », qui ouvre le tableau de bord du Secrétariat pour traiter
   les demandes internes. Deux entrées homonymes vers deux écrans sans rapport entretiennent la
   confusion.

2. **La Comptabilité est rangée avec les ressources matérielles.** Elle figure aujourd'hui dans la
   section *Ressources*, aux côtés des Salles et des Offres d'emploi. Or c'est un circuit de
   demandes — on soumet une note de frais ou une avance, elle est traitée, validée ou rejetée —,
   de même nature que les demandes internes et les demandes de visuels regroupées dans
   *Opérations*. Les utilisateurs la cherchent là.

Le menu existe sous deux formes — la barre latérale (ordinateur) et le menu mobile — qui
doivent présenter la même organisation : un utilisateur qui passe de l'un à l'autre ne doit pas
retrouver ses entrées à des endroits différents.

## Utilisateurs concernés

- **Secrétaire** — premier concerné par le point 1 : crée et configure les événements, et
  traite les demandes internes (les deux entrées « Gestion »).
- **Admin, Super Admin** — voient les mêmes entrées, même bénéfice.
- **Comptable, Ministre, Resp. département, Admin, Super Admin** — voient l'entrée
  Comptabilité ; elle change de section pour eux.
- **Autres rôles** — aucun changement visible (ils ne voient aucune des entrées concernées).

Aucun droit ne change : qui voit une entrée aujourd'hui la voit demain, qui ne la voit pas ne la
voit toujours pas.

## Comportement attendu

### Scénario principal — créer un événement

1. Une Secrétaire ouvre la section *Événements* du menu.
2. Elle y voit, à côté de *Liste* et *Calendrier*, une entrée dont le libellé dit explicitement
   qu'on y crée et configure les événements.
3. Elle l'ouvre et arrive sur la même page qu'aujourd'hui.

### Scénario principal — soumettre une note de frais

1. Un Responsable de département cherche la Comptabilité.
2. Il la trouve dans la section *Opérations*, avec les autres circuits de demandes.
3. La section *Ressources* ne contient plus que les Salles et les Offres d'emploi.

### Scénarios alternatifs / cas limites

- **Un Comptable** (qui n'a ni demandes internes ni visuels) : la section *Opérations*
  apparaît pour lui, avec la seule entrée Comptabilité. Il ne perd aucun accès et la
  Comptabilité reste à un clic de la section.
- **Un utilisateur dont la section *Ressources* ne contenait que la Comptabilité** : la section
  *Ressources* disparaît de son menu plutôt que de rester vide.
- **Sur une page de la Comptabilité**, la section *Opérations* est ouverte et l'entrée
  Comptabilité est mise en évidence — dans la barre latérale comme dans le menu mobile.
- **Le parcours de découverte guidé** (visite de l'interface) qui présente les sections du menu
  reste cohérent avec la nouvelle organisation : il ne désigne pas une section vide ou déplacée.
- **Le profil pastoral**, qui dispose d'un menu simplifié propre où la Comptabilité est déjà une
  entrée de premier niveau, n'est pas modifié.

## Critères d'acceptation

- [ ] Dans la section *Événements*, l'entrée menant à la création/configuration des événements a
      le libellé « Gérer les événements »,
      identique dans la barre latérale et dans le menu mobile.
- [ ] Aucune entrée du menu ne s'intitule plus seulement « Gestion » ; l'entrée du tableau de
      bord du Secrétariat s'intitule « Traitement des demandes ».
- [ ] L'entrée Comptabilité apparaît dans la section *Opérations* et n'apparaît plus dans la
      section *Ressources*, dans la barre latérale comme dans le menu mobile.
- [ ] Un Comptable voit la section *Opérations* avec l'entrée Comptabilité.
- [ ] Un utilisateur sans Salles ni Offres d'emploi ne voit plus de section *Ressources*.
- [ ] Sur une page de la Comptabilité, la section *Opérations* est ouverte et l'entrée
      Comptabilité mise en évidence (barre latérale et menu mobile).
- [ ] La visibilité de chaque entrée est inchangée pour chacun des 10 rôles.
- [ ] Le guide utilisateur et le parcours de découverte ne mentionnent plus « Gestion » ni la
      Comptabilité sous *Ressources*.
- [ ] Les adresses des pages ne changent pas : un favori ou un lien existant continue de
      fonctionner.

## Hors périmètre

- Toute autre réorganisation du menu (ordre des sections, regroupements, icônes).
- Le menu simplifié du profil pastoral.
- Le contenu des pages elles-mêmes (création d'événement, Comptabilité, tableau de bord du
  Secrétariat).
- Toute modification de droits.

## Décisions (clarifications du 2026-09-11)

- L'entrée de la section *Événements* s'intitule **« Gérer les événements »**.
- L'entrée « Gestion » de la section *Opérations* est renommée **« Traitement des demandes »**.
