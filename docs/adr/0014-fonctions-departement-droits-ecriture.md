# ADR-0014 — Certaines fonctions de département confèrent des droits d'écriture, nommément

- **Statut** : Accepté
- **Date** : 2026-09-12

## Contexte

[ADR-0013](0013-perimetre-appartenance-lecture-seule.md) a reconnu un **périmètre
d'appartenance** (compte lié à une fiche → `member_departments`), distinct du périmètre de
responsabilité (ADR-0009), et lui a imposé une règle 1 stricte :

> **Lecture seule.** L'appartenance ne confère jamais un droit de création, modification ou
> suppression.

Cette règle était juste pour le besoin qui l'a motivée (spec 044 : rendre des événements d'équipe
**lisibles** par les membres d'un département). Elle ne l'est plus comme règle générale, pour deux
raisons.

**Elle est déjà contredite par le code existant.** Les specs 040 et 041, acceptées et déployées,
accordent des droits d'**écriture** sur la seule appartenance :

- `canDepositAnnouncementSheet` — n'importe quel membre d'un département de fonction
  `SECRETARIAT` (ou du ministère Coordination générale) **dépose et retire** la trame des annonces ;
- `canManageOpeningClosing` — n'importe quel membre d'un département de fonction `SECRETARIAT`
  **désigne et retire** les responsables d'ouverture/fermeture.

Le même patron existe hors planning : `isProductionMediaMember` et `isCommunicationMember`
(`src/lib/auth.ts`) ouvrent l'upload et la gestion média sur l'appartenance ;
`isCaptureTeamMember` (module audio) ouvre le dépôt et la publication ; `isProtocoleMember`
(module agenda) ouvre `agenda:manage`.

**Le besoin devient structurel.** La spec 045 acte que les droits du Secrétariat doivent découler
de l'appartenance à l'équipe Secrétariat plutôt que d'un rôle attribué à un compte — l'équipe qui
fait le travail étant la bonne source de vérité, et le départ de l'équipe devant retirer les
droits sans intervention. Maintenir la règle 1 telle quelle rendrait cette direction impossible
tout en laissant le code la violer par endroits.

## Décision

On **amende ADR-0013** : sa règle 1 devient la règle **par défaut**, et non plus un absolu.

1. **Par défaut, l'appartenance reste en lecture seule.** Toute donnée rendue lisible par
   appartenance suit ADR-0013 inchangé (règles 2 à 5 incluses).
2. **Exception nommée par fonction de département.** Une fonction de département
   (`Department.function`, cf. `DEPT_FN`) peut conférer des droits d'écriture, à deux conditions :
   - la fonction est **explicitement désignée** par une spec acceptée, et les droits conférés y
     sont **énumérés** — jamais « tous les droits de ce périmètre », jamais implicite ;
   - la composition du département devient de ce fait une **décision de sécurité**, à documenter
     dans le guide utilisateur au même titre que l'attribution d'un rôle.
3. **Les règles 2, 4 et 5 d'ADR-0013 restent intégralement valables** : identité résolue côté
   serveur à partir du compte de la session (jamais un `memberId` client), `getUserDepartmentScope`
   et `requireDepartmentAccess` inchangés, appartenance évaluée à chaque requête et non mise en
   cache durablement.
4. **La règle 3 (« point d'entrée dédié par donnée ») est assouplie pour ce cas** : quand
   l'exception porte non sur une donnée mais sur un ensemble large de droits — cas de la spec 045,
   où l'équipe Secrétariat obtient les 28 permissions du rôle Secrétaire — écrire une fonction de
   service par surface serait pire que le mal. La résolution se fait alors **en un point unique et
   nommé**, au plus près de la construction de la session, de sorte que l'ensemble des gardes
   existantes l'applique sans être modifié.
5. **Fonctions concernées à ce jour** : `SECRETARIAT` (trame des annonces, ouverture/fermeture,
   et à partir de la spec 045 l'ensemble des droits du Secrétariat), le ministère
   `Coordination générale` (trame), `PRODUCTION_MEDIA` et `COMMUNICATION` (médias),
   `CAPTATION_AUDIO` (audio), `PROTOCOLE` (agenda pastoral). Toute nouvelle entrée passe par une
   spec.

## Alternatives considérées

- **Maintenir la règle 1 et régulariser le code existant** (retirer les droits d'écriture des
  specs 040/041) — *Écarté* : ce sont des exigences métier explicites et déployées ; les retirer
  reviendrait à casser des features validées pour sauver une règle écrite après elles.
- **Remplacer ADR-0013 par un nouvel ADR** — *Écarté* : ses règles 2, 4 et 5 restent exactes et
  utiles, et sa distinction fondatrice entre les deux périmètres est intacte. Un amendement ciblé
  se relit mieux qu'une réécriture qui rejouerait le même raisonnement.
- **Créer un rôle « Secrétariat d'équipe » dans la matrice** — *Écarté* : un rôle s'attribue à un
  compte, ce qui reproduit exactement le problème que la spec 045 veut supprimer (droits qui
  survivent au départ de l'équipe).
- **Un helper générique `getUserMembershipScope` utilisable comme garde** — *Écarté pour les mêmes
  raisons qu'en ADR-0013* : il inviterait à ouvrir des routes adressées par `departmentId` sans
  énumération explicite des droits. L'exception doit rester nommée, pas générique.

## Conséquences

- **Positif** : le code et la doctrine redeviennent cohérents — les specs 040/041 cessent d'être
  des violations non documentées.
- **Positif** : la spec 045 devient implémentable sans contourner une décision acceptée.
- **Positif** : la liste des fonctions à droits d'écriture est énumérable en un endroit, donc
  auditable en revue.
- **Négatif** : la frontière entre les deux périmètres est moins nette qu'avec un absolu ; un
  relecteur doit désormais vérifier si la fonction visée figure dans la liste de la règle 5.
- **Négatif / contrainte** : la composition des départements porteurs de ces fonctions devient
  sensible. Ajouter quelqu'un au département Secrétariat lui donnera, à partir de la spec 045,
  l'équivalent du rôle Secrétaire.
- **Contrainte inchangée** : un utilisateur sans fiche membre liée n'a aucun périmètre
  d'appartenance, donc aucun de ces droits.

## Références

- [ADR-0013](0013-perimetre-appartenance-lecture-seule.md) — amendé par le présent ADR
- [ADR-0009](0009-garde-perimetre-explicite.md) — périmètre de responsabilité, inchangé
- `specs/045-droits-equipe-secretariat/` — spec et plan à l'origine de l'amendement
- `specs/040-annonces-hebdomadaires/`, `specs/041-ouverture-fermeture-eglise/` — précédents
- `src/modules/planning/services/announcement-sheet.service.ts`,
  `src/modules/planning/services/opening-closing.service.ts`, `src/lib/auth.ts`
