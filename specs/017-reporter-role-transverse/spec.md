# Spec — Rôle Reporter géré comme rôle transverse

- **Numéro** : 017
- **Statut** : Implémentée
- **Créée le** : 2026-08-23 *(rédigée a posteriori — voir Note de rattrapage)*
- **Branche suggérée** : `fix/reporter-transverse-role` *(déjà mergée, voir Historique)*

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Note de rattrapage

Cette spec est rédigée **après** l'implémentation et le merge (PR #454), en
rattrapage : le changement aurait dû passer par `/specify` avant le code,
conformément à la règle du projet selon laquelle une évolution
ergonomique/UI — même modeste — n'est pas un "fix trivial" exempté de spec.
Elle documente donc un comportement déjà en production, à titre de traçabilité.

## Contexte & problème

L'écran d'administration des accès (`/admin/access`) attribuait le rôle
`REPORTER` via un onglet dédié ("Comptes rendus"), avec sa propre recherche et
son propre bouton d'attribution/retrait — un mécanisme dupliqué de celui déjà
utilisé pour les autres rôles transverses (`ADMIN`, `SECRETARY`,
`DISCIPLE_MAKER`, `AGENDA_QUALIFIER`, `ACCOUNTANT`), qui partagent un onglet
générique "Rôles transverses". Cette duplication rendait l'écran plus long à
maintenir et incohérent pour l'administrateur (deux façons différentes
d'attribuer un rôle transverse selon lequel).

## Utilisateurs concernés

- **Super Admin / Admin** : attribuent/retirent le rôle Reporter à un
  utilisateur, désormais depuis l'onglet "Rôles transverses" au lieu d'un
  onglet séparé.
- **Reporter** : aucun changement de son point de vue — les permissions et
  accès associés au rôle sont inchangés.

## Comportement attendu

### Scénario principal

1. Un Admin ouvre `/admin/access`, onglet "Rôles transverses".
2. Il voit désormais `Reporter` dans la liste des rôles attribuables, au même
   titre que les autres rôles transverses.
3. Il clique sur "+ Reporter" pour un utilisateur : le rôle est attribué (même
   comportement API qu'avant — `POST /api/users/{userId}/roles`).
4. Il clique sur "Retirer Reporter" : le rôle est retiré (`DELETE`).

### Scénarios alternatifs / cas limites

- **Si** l'onglet "Comptes rendus" existait en favori/lien direct → il n'existe
  plus ; l'utilisateur est redirigé implicitement vers "Rôles transverses" en
  retombant sur l'onglet actif par défaut.

## Critères d'acceptation

- [x] Le rôle `Reporter` apparaît dans la liste des rôles de l'onglet "Rôles
      transverses", avec son libellé et sa couleur de badge.
- [x] L'attribution/retrait du rôle Reporter depuis cet onglet produit le même
      résultat API qu'avant (même endpoint, même payload).
- [x] L'onglet "Comptes rendus" dédié n'existe plus.
- [x] Aucune régression sur les autres rôles transverses (`ADMIN`,
      `SECRETARY`, `DISCIPLE_MAKER`, `AGENDA_QUALIFIER`, `ACCOUNTANT`).

## Hors périmètre

- Changement des permissions associées au rôle `REPORTER` (aucune modification
  de `rolePermissions` ni du module `events`/`reports`).
- Ajout ou retrait d'autres rôles transverses.

## Questions ouvertes

*Aucune — implémentation déjà validée en production.*
