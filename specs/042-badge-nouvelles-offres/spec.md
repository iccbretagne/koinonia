# Spec — Pastille « nouvelles offres » dans le menu

- **Numéro** : 042
- **Statut** : Validée
- **Créée le** : 2026-09-11
- **Branche suggérée** : `feat/badge-nouvelles-offres`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.
> Aucun nom de table, de librairie, d'endpoint ou de composant ici. Le technique va dans `plan.md`.

## Contexte & problème

Les offres d'emploi publiées sur la plateforme passent inaperçues : rien dans le menu n'indique
qu'une nouvelle offre est arrivée, il faut penser à ouvrir la page *Offres* pour le découvrir.
Retour de recette : afficher directement sur l'entrée *Offres* du menu le nombre d'offres
publiées depuis la dernière visite.

## Utilisateurs concernés

Tous les utilisateurs qui voient l'entrée *Offres* (tous les rôles ont accès aux offres).

## Comportement attendu

### Scénario principal

1. Un STAR a consulté la page *Offres* lundi.
2. Mardi et mercredi, deux nouvelles offres sont publiées.
3. Jeudi, en ouvrant l'application, il voit une pastille « 2 » sur l'entrée *Offres* du menu.
4. Il ouvre la page *Offres* : la pastille disparaît.

### Scénarios alternatifs / cas limites

- **Première visite** (l'utilisateur n'a jamais ouvert *Offres*) : seules les offres publiées
  récemment comptent [décision par défaut : les 30 derniers jours], pour ne pas afficher tout
  l'historique.
- Les offres **retirées, pourvues ou expirées** ne sont pas comptées.
- Les offres **publiées par l'utilisateur lui-même** ne sont pas comptées.
- Au-delà de 9, la pastille affiche « 9+ ».
- La pastille apparaît aussi sur l'en-tête de la section qui contient *Offres* quand la section
  est repliée, pour rester visible.
- Même comportement dans la barre latérale (ordinateur) et le menu mobile, y compris le menu du
  profil pastoral.
- La dernière visite est propre à chaque utilisateur, et suit l'utilisateur d'un appareil à
  l'autre.
- Aucune pastille quand il n'y a rien de nouveau.

## Critères d'acceptation

- [ ] L'entrée *Offres* affiche le nombre d'offres publiées depuis la dernière visite de la page.
- [ ] Ouvrir la page *Offres* remet le compteur à zéro.
- [ ] Les offres non publiées et celles de l'utilisateur ne sont pas comptées.
- [ ] Pastille visible aussi sur la section repliée ; « 9+ » au-delà de 9.
- [ ] Cohérent barre latérale / menu mobile / menu pastoral.
- [ ] Le compteur est identique d'un appareil à l'autre pour un même utilisateur.

## Hors périmètre

- Notifications (cloche, e-mail) pour les nouvelles offres.
- Pastilles sur d'autres entrées du menu.
- Distinction offre d'emploi / mission freelance dans le compteur.
