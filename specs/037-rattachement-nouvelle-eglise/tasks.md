# Tâches — Rattachement d'une personne à une nouvelle église

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/rattachement-nouvelle-eglise`
- [x] Migration Prisma : **aucune** — le plan ne modifie pas le schéma

## Tâches

### 0. Filet de sécurité — avant toute extraction

> `PATCH /api/member-link-requests/[id]` n'a **aucun test** aujourd'hui, alors que c'est la
> transaction la plus chargée du domaine et celle que la tâche T2 va déplacer. Écrire ces tests
> d'abord est ce qui rend l'extraction vérifiable au lieu d'être un pari.

- [x] **T1** — Tests de non-régression de l'approbation d'une demande, sur le comportement
      **actuel** : rôle `STAR` attribué quand la personne n'a aucun rôle dans l'église, **non**
      attribué quand elle en a déjà un ; création du STAR pour une demande de nouvelle fiche ;
      attribution du rôle demandé (Ministre / Responsable / Faiseur de disciples / Reporter) ;
      refus si le département ou le ministère n'appartient pas à l'église de la demande ; refus
      d'une demande déjà traitée. *(fichier : `src/app/api/member-link-requests/[id]/__tests__/route.test.ts`)*

### 1. Logique métier (service partagé)

- [x] **T2** — Créer `admitToChurch(tx, …)` par **extraction** de la transaction d'approbation,
      sans changement de comportement : création du `Member` si nouvelle fiche, `MemberUserLink`,
      `displayName`, rôle demandé, rôle `STAR` par défaut si aucun rôle, validations
      d'appartenance département/ministère → église. *(fichier : `src/lib/admission.ts`)*
- [x] **T3** — Faire déléguer la route d'approbation à `admitToChurch`. **T1 doit rester vert
      sans être modifié** — c'est le critère de réussite de l'extraction.
      *(fichier : `src/app/api/member-link-requests/[id]/route.ts`)*
- [x] **T4** — Ne plus écraser `displayName` s'il est déjà renseigné. Aujourd'hui un rattachement
      dans l'église B écrase le nom défini par l'église A ; cette feature rend le cas courant.
      *(fichier : `src/lib/admission.ts`)*

### 2. API (route handlers)

- [x] **T5** [P] — Recherche par **email exact** cross-église dans la recherche d'utilisateurs :
      déclenchée seulement si la requête contient `@`, jamais de `contains` sur l'email, recherche
      par nom inchangée et toujours bornée à l'église. *(fichier : `src/app/api/users/search/route.ts`)*
- [x] **T6** — Lever le verrou d'écriture du rattachement : remplacer le contrôle qui exige un
      rôle ou une demande préalable dans l'église par la résolution de la cible (`userId` **ou**
      `email` exact), puis appel de `admitToChurch`. Conserver la garde `members:manage` et les
      refus métier existants (STAR déjà lié, compte déjà lié dans cette église).
      *(fichier : `src/app/api/member-user-links/route.ts`)*
- [x] **T7** — Cas de l'adresse inconnue : répondre 409 avec un marqueur explicite, et ne créer le
      compte que si le client renvoie `confirmCreate: true` (double confirmation exigée par la
      spec). *(fichier : `src/app/api/member-user-links/route.ts`)*

### 3. UI

- [x] **T8** [P] — Le profil propose **toutes** les églises : charger la liste complète et les
      ministères sans restriction, puis appliquer le filtre `unlinkableChurches` existant pour
      retirer celles où l'utilisateur a déjà un lien, un rôle ou une demande en attente.
      `NoAccessClient` n'est pas modifié. *(fichier : `src/app/(auth)/profile/page.tsx`)*
- [x] **T9** [P] — Modale « Lier un compte » : quand la saisie contient `@` et qu'aucun compte ne
      correspond, proposer explicitement de rattacher tout de même l'adresse (`confirmCreate`), en
      indiquant que la personne sera admise à sa première connexion. Réutiliser `Modal`, `Input`,
      `Button`. *(fichier : `src/app/(auth)/admin/members/MembersClient.tsx`)*

### 4. Tests

- [x] **T10** — Tests du service d'admission : rôle `STAR` attribué / non attribué, création du
      `Member`, refus département ou ministère hors église, `displayName` **non** écrasé s'il
      existe déjà (T4). *(fichier : `src/lib/__tests__/admission.test.ts`)*
- [x] **T11** [P] — Tests de la recherche : correspondance email exacte retrouve un compte sans
      rattachement dans l'église courante ; aucune recherche email sans `@` ; résultat exclu si
      déjà lié dans cette église ; la recherche par nom ne porte jamais sur l'email.
      *(fichier : `src/app/api/users/search/__tests__/route.test.ts`)*
- [x] **T12** [P] — Tests du rattachement : un compte sans aucun rattachement dans l'église est
      admis **et reçoit un rôle** (le test qui aurait attrapé le défaut de la PR #524) ; refus
      conservés (STAR déjà lié, compte déjà lié) ; création sur adresse inconnue seulement avec
      `confirmCreate`. *(fichier : `src/app/api/member-user-links/__tests__/route.test.ts`)*
- [x] **T13** [P] — Test d'isolation multi-tenant : une admission dans l'église B ne modifie aucun
      rôle, lien ni fiche dans l'église A. *(fichier : `src/lib/__tests__/admission.test.ts`)*
- [x] **T14** [P] — Test du profil : la liste proposée exclut les églises où l'utilisateur a déjà
      un lien, un rôle ou une demande en attente. **Réalisé différemment** : aucun `page.tsx` du
      repo n'a de test aujourd'hui (rendu de composant serveur, aucune infrastructure existante) —
      en écrire une pour un filtre de trois lignes aurait été la mauvaise proportion. L'exclusion
      est extraite en fonction pure `excludeChurchesAlreadyReached()` dans `src/lib/onboarding.ts`
      (précédent direct : ce fichier héberge déjà ce type de logique partagée), et testée là où
      vivent ses tests. *(fichiers : `src/lib/onboarding.ts`, `src/lib/__tests__/onboarding.test.ts`)*

### 5. Documentation & cohérence

> Ces tâches ne sont pas de la finition : sans elles, la documentation affirme le contraire du
> code livré.

- [x] **T15** [P] — Documenter les deux endpoints modifiés : recherche par email exact, et
      rattachement par email avec `confirmCreate`. *(fichier : `docs/api.md`, sections
      `GET /api/users/search` (l. 781) et `POST /api/member-user-links` (l. 891))*
- [x] **T16** [P] — Mettre à jour l'entrée T11 du registre des exceptions : la recherche par email
      exact traverse volontairement la frontière d'église, et l'annuaire des noms d'églises est
      visible de tout utilisateur authentifié. *(fichier : `docs/security-exceptions.md`)*
- [x] **T17** [P] — Porter une note dans la spec 036 : son critère d'acceptation reste vrai (le
      parcours de partage audio ne propose aucune liste) mais **sa justification ne l'est plus** —
      le mécanisme d'identifiant reste un garde-fou contre l'erreur de destinataire, pas une
      mesure de confidentialité de l'annuaire.
      *(fichier : `specs/036-partage-bibliotheque-audio/spec.md`)*
- [x] **T18** — Vérifié : les deux routes touchées continuent d'importer Prisma directement
      (validations avant l'ouverture de la transaction). Seuil inchangé (147/170), `npm run
      lint:prisma-boundary` passe sans modification de `scripts/prisma-boundary-baseline.txt`.

## Couverture des critères d'acceptation

| Critère (spec) | Tâches |
|---|---|
| Rattacher par email exact un compte de l'église A | T5, T6, T11, T12 |
| La personne accède effectivement à l'église (pas liée sans droits) | T2, T6, T12 |
| Rattachements dans les autres églises inchangés | T13 |
| Recherche par nom ne sort jamais de l'église | T5, T11 |
| Un fragment d'email ne renvoie rien | T5, T11 |
| Demande depuis le profil vers une église sans rôle | T8, T14 |
| Églises déjà rejointes non proposées | T8, T14 |
| Même parcours que pour un nouvel arrivant | T8 *(NoAccessClient réutilisé tel quel)* |
| Aucun droit tant que non validée | *existant, couvert par* T1 |
| Une demande validée produit la même admission | T2, T3, T10 |
| Les deux chemins tracés à l'audit | T6 *(audit conservé chez les appelants)* |
| Aucun rattachement par l'utilisateur pour lui-même | *existant, couvert par* T1 |
| Refus si STAR déjà pris ou compte déjà lié | T6, T12 |

Les treize critères sont couverts. Deux le sont par du comportement **existant** que T1 met sous
test sans le modifier.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] PR ouverte vers `main`
