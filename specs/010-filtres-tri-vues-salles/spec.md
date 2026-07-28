# Spec — Filtres et tri sur les vues du module de réservation de salles

- **Numéro** : 010
- **Statut** : Implémentée
- **Créée le** : 2026-07-26
- **Branche suggérée** : `feat/gestion-reservation-salles` (poursuite des features 008 et 009, non mergée)

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

La 009 a ajouté un tri et un filtre à la vue liste des réservations (page de réservation, onglet
« Liste »). Deux autres vues du même module n'ont aujourd'hui aucun moyen de trier ou filtrer leur
contenu, alors qu'elles listent potentiellement autant d'éléments :

- La liste des salles (administration) : affiche toutes les salles de l'église sans distinction
  entre actives et désactivées, ni possibilité de les trier.
- Le tableau de contrôle des mains courantes (équipe dédiée sécurité/entretien) : affiche toutes
  les réservations à traiter ou déjà traitées, triées uniquement par date de début décroissante,
  sans filtre.

À mesure que le nombre de salles ou de réservations augmente, ces deux écrans deviennent plus
difficiles à parcourir pour retrouver un élément précis.

## Utilisateurs concernés

- **Admin / Super Admin** : gèrent le référentiel des salles, veulent retrouver rapidement une
  salle par statut ou par nom dans la liste d'administration.
- **Équipe dédiée (sécurité / entretien)** : contrôle les mains courantes, veut retrouver
  rapidement les réservations d'une salle donnée ou dans un statut de main courante donné.

Rôles non concernés : les autres rôles n'ont pas accès à ces deux écrans (déjà cadré en 008).

## Comportement attendu

### Scénario principal

1. Un Admin consulte la liste des salles en administration : il peut filtrer par statut (actives
   uniquement, désactivées uniquement, ou toutes) et trier la liste par nom.
2. Un membre de l'équipe dédiée consulte le tableau de contrôle des mains courantes : il peut
   filtrer par salle et par statut de main courante, et trier par date.
3. Dans les deux cas, une fois un tri ou un filtre appliqué, il reste actif tant que
   l'utilisateur ne le change pas ou ne quitte pas la page — comme déjà établi pour la vue liste
   des réservations en 009.

### Scénarios alternatifs / cas limites

- **Si** aucune salle/réservation ne correspond au filtre choisi, **alors** l'écran l'indique
  clairement (liste vide), sans erreur.
- **Si** un filtre est appliqué puis retiré, **alors** l'ensemble des éléments réapparaît.

## Critères d'acceptation

- [x] La liste des salles (administration) peut être filtrée par statut (active/désactivée).
- [x] La liste des salles (administration) peut être triée par nom.
- [x] Le tableau de contrôle des mains courantes peut être filtré par salle.
- [x] Le tableau de contrôle des mains courantes peut être filtré par statut de main courante.
- [x] Le tableau de contrôle des mains courantes peut être trié par date.

## Hors périmètre

- La vue liste des réservations (`/rooms`, onglet « Liste ») : tri/filtre déjà couverts par la
  spec 009 ; non revus ici sauf demande explicite d'extension.
- Toute règle métier déjà tranchée dans les spécifications 008/009 (disponibilité, récurrence,
  contenu de la main courante, actions de suivi sur réservations non déclarées).
- Toute modification du contenu affiché (colonnes) des deux vues concernées, au-delà de
  l'ajout du tri/filtre lui-même.

## Questions ouvertes

Aucune question bloquante restante — la liste des salles se limite au filtre par statut et au tri
par nom (pas de filtre par capacité ni par partage cross-église pour cette itération, le nombre de
salles par église restant faible en pratique).
