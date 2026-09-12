# ADR-0013 — Périmètre d'appartenance, en lecture seule, distinct du périmètre de responsabilité

- **Statut** : Accepté — **amendé par [ADR-0014](0014-fonctions-departement-droits-ecriture.md)**
- **Date** : 2026-09-11

## Contexte

Koinonia connaît deux chaînes qui relient un utilisateur à un département :

- la **responsabilité** : `UserChurchRole` → `user_departments` (Resp. département, adjoint) ou
  ministère assigné (Ministre). C'est le périmètre de `getUserDepartmentScope` et de la garde
  `requireDepartmentAccess` (ADR-0009) ;
- l'**appartenance** : compte lié à une fiche (`member_user_links`) → `member_departments`.

La spec 031 et ADR-0009 ont acté de **ne pas fusionner** ces deux chaînes : un STAR a un périmètre
de responsabilité vide, ce qui lui ferme toutes les routes de département sans code par rôle.

La spec 044 (événements d'équipe, issue #522) introduit le premier besoin où une donnée de
département doit être **lisible par ses membres** au titre de leur appartenance, quel que soit
leur rôle. L'élargir via le périmètre de responsabilité rouvrirait au STAR toutes les routes de
département ; l'ignorer rend la feature impossible.

## Décision

On reconnaît un second périmètre, **d'appartenance**, avec des règles strictes qui le tiennent à
l'écart du périmètre de responsabilité :

1. **Lecture seule.** L'appartenance ne confère jamais un droit de création, modification ou
   suppression. Toute écriture reste gardée par une permission de rôle + `requireDepartmentAccess`.
   > **Amendé le 2026-09-12 par [ADR-0014](0014-fonctions-departement-droits-ecriture.md)** : cette
   > règle est désormais le **défaut**, non un absolu. Une fonction de département explicitement
   > désignée par une spec peut conférer des droits d'écriture énumérés — ce que font déjà les
   > specs 040 et 041. Les règles 2, 4 et 5 ci-dessous restent intégralement valables.
2. **Identité résolue côté serveur.** Le périmètre d'appartenance se calcule à partir de la fiche
   membre liée **au compte de la session** dans l'église courante — jamais à partir d'un
   `memberId` ou d'un `departmentId` fourni par le client.
3. **Point d'entrée dédié par donnée.** Chaque donnée lisible par appartenance l'est via une
   fonction de service explicite du module propriétaire (ex. `listTeamEventsForMember(churchId,
   memberId)`), qui filtre par `churchId` **et** par `member_departments`. Pas de helper générique
   « départements de l'utilisateur » réutilisable comme garde.
4. **`getUserDepartmentScope` et `requireDepartmentAccess` ne changent pas.** Le STAR garde un
   périmètre de responsabilité vide ; ADR-0009 reste intégralement valable.
5. **Calcul à la lecture.** L'appartenance est évaluée à chaque requête (pas de cache en session),
   de sorte qu'un retrait de département est effectif immédiatement.

## Alternatives considérées

- **Fusionner appartenance et responsabilité dans `getUserDepartmentScope`** — *Écarté* : défait
  la décision de la spec 031 ; ouvrirait au STAR la grille de planning, les tâches, les consignes,
  les statistiques de ses départements.
- **Une permission de rôle (`team-events:view`) accordée au STAR** — *Écarté* : une permission de
  rôle ne dit rien du département ; il faudrait de toute façon filtrer par appartenance, et la
  permission seule laisserait croire à un accès global.
- **Un helper générique `getUserMembershipScope` utilisable comme garde de route** — *Écarté pour
  l'instant* : inviterait à l'utiliser pour des écritures ou des routes adressées par
  `departmentId`. À reconsidérer si plusieurs données en ont besoin, avec la règle 1 intégrée.

## Conséquences

- **Positif** : la feature 044 ne crée aucune route accessible au STAR ; la surface d'attaque
  n'augmente pas pour ce rôle.
- **Positif** : les deux périmètres restent nommés et séparés ; un relecteur sait lequel s'applique
  en regardant la fonction appelée.
- **Négatif** : chaque future donnée lisible par appartenance nécessite sa propre fonction de
  service (légère duplication de la condition `member_departments`).
- **Contrainte** : un utilisateur sans fiche membre liée n'a aucun périmètre d'appartenance.

## Références

- `specs/044-evenements-equipe/spec.md`, `plan.md` — issue #522
- ADR-0009 (garde de périmètre explicite), `specs/031-perimetres-acces/`
- `src/lib/auth.ts` (`getUserDepartmentScope`, `requireDepartmentAccess`)
