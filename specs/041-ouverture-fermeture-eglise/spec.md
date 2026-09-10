# Spec — Service d'ouverture et de fermeture de l'église

- **Numéro** : 041
- **Statut** : Brouillon
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/ouverture-fermeture-eglise`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Pour chaque culte ou activité, quelqu'un doit **ouvrir** l'église (arriver en avance, déverrouiller,
désactiver l'alarme…) et quelqu'un doit la **fermer** (vérifier les salles, verrouiller). Cette
responsabilité est aujourd'hui répartie entre la Sécurité et le Secrétariat, et communiquée de
façon informelle : il arrive que personne ne sache qui a les clés, ou que deux personnes se
déplacent pour rien.

On veut que la Sécurité et le Secrétariat puissent **désigner nominativement** qui est de service
d'ouverture et de fermeture, et que cette information soit **visible sur le planning**.

## Utilisateurs concernés

- **Désignent** : les responsables (et adjoints) du département Sécurité et du département
  Secrétariat ; le rôle Secrétaire ; Admin et Super Admin.
  [À CLARIFIER: les STAR de ces départements peuvent-ils aussi désigner, ou seulement les responsables ?]
- **Désignés** : [À CLARIFIER: uniquement des STAR des départements Sécurité et Secrétariat, ou
  n'importe quel membre de l'église ?]
- **Consultent** : tous ceux qui voient le planning de l'événement (y compris la personne
  désignée dans « Mon planning »).

## Comportement attendu

### Scénario principal

1. Le responsable Sécurité ouvre le planning d'un événement à venir.
2. Il voit deux créneaux : « Ouverture » et « Fermeture ».
3. Il désigne une personne pour l'ouverture et une (éventuellement la même) pour la fermeture.
4. Les noms apparaissent sur le planning de l'événement, visibles de tous ceux qui y ont accès.
5. La personne désignée voit ce service dans « Mon planning ».

### Scénarios alternatifs / cas limites

- **Unité** : [À CLARIFIER: la désignation se fait **par événement** (chaque culte/activité), ou
  **par jour** (une ouverture/fermeture couvre tous les événements d'une même journée) ? par
  défaut : par événement.]
- **Plusieurs personnes** : [À CLARIFIER: une seule personne par créneau, ou plusieurs possibles ?
  par défaut : une ou plusieurs.]
- **Si** la Sécurité et le Secrétariat désignent chacun quelqu'un pour le même créneau, les deux
  voient la désignation de l'autre avant de la modifier (pas d'écrasement silencieux).
- **Si** la personne désignée a déclaré une absence à cette date, le désignateur en est averti.
- **Quand** aucun nom n'est désigné pour un événement proche, le créneau apparaît explicitement
  « non pourvu ».
- Une désignation peut être modifiée ou retirée jusqu'à l'événement.
- **Multi-église** : les désignations sont propres à chaque église.
- [À CLARIFIER: la personne désignée doit-elle être notifiée ? par défaut : notification dans
  l'application.]

## Critères d'acceptation

- [ ] Sécurité et Secrétariat (responsables, Secrétaire, Admin) peuvent désigner qui ouvre et qui ferme.
- [ ] Les autres rôles ne peuvent pas modifier ces désignations.
- [ ] Les noms désignés sont affichés sur le planning de l'événement.
- [ ] La personne désignée voit ce service dans « Mon planning ».
- [ ] Un créneau sans désignation est affiché « non pourvu ».
- [ ] Désigner une personne absente déclenche un avertissement.
- [ ] Les désignations sont cloisonnées par église.
- [ ] Cohérent sur mobile (consultation et désignation).

## Hors périmètre

- Gestion des clés, badges ou codes d'alarme.
- Horaires précis d'ouverture/fermeture (l'heure de l'événement fait référence).
- Rotation automatique des personnes.
- Autres créneaux logistiques (installation, rangement…).

## Questions ouvertes

- [À CLARIFIER: qui peut désigner (responsables seulement, ou STAR aussi)]
- [À CLARIFIER: qui peut être désigné]
- [À CLARIFIER: par événement ou par jour]
- [À CLARIFIER: une ou plusieurs personnes par créneau]
- [À CLARIFIER: notification de la personne désignée]
