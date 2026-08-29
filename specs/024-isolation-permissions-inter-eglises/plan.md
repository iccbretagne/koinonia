# Plan technique — Isolation inter-églises des contrôles de permission

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import inter-modules ; le travail porte sur `src/lib/auth.ts` et les route handlers de `src/app/`
- [x] **Sécurité** : c'est l'objet même du plan — le multi-tenant `churchId` devient structurellement obligatoire
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — inchangé, aucune permission ajoutée ni retirée
- [x] **Validation** Zod sur les mutations — inchangée, aucun body modifié
- [x] **Migration** Prisma : **aucune** — pas de changement de schéma
- [x] **Enums** depuis `@/generated/prisma/client` — inchangé
- [x] **UI** : aucun nouveau composant ; on corrige le calcul des droits du layout existant

## Approche générale

Le fil directeur est **supprimer la possibilité d'exprimer l'erreur** plutôt que corriger
31 appels et espérer que le 32ᵉ sera correct.

`requirePermission(permission, churchId?)` est **supprimé**. Comme son `churchId` optionnel
est la cause racine, sa disparition transforme chaque omission en **erreur de compilation
TypeScript** — c'est le mécanisme d'application du critère « un contrôle omettant l'église
est impossible à exprimer ». Aucune règle de lint, aucune convention à retenir.

À sa place, trois gardes aux intentions **explicites et distinctes**, correspondant aux
trois catégories réelles observées dans le code :

| Catégorie | Garde | Appels concernés |
|---|---|---|
| Action dans une église | `requireChurchPermission(permission, churchId)` | 23 |
| Administration plateforme | `requireSuperAdmin()` | 4 (`church:manage`) |
| Domaine volontairement transverse | `requirePlatformPermission(permission)` | 4 (module emploi) |

Point décisif : **`requireChurchPermission` existe déjà et implémente la bonne sémantique**,
supervision pastorale en lecture seule comprise (liste blanche `PASTORAL_READ_PERMISSIONS`).
Le travail n'est donc pas d'inventer une règle mais de la rendre incontournable, exactement
comme la spec le formule.

## Modèle de données

`[Aucun changement]` — aucune migration Prisma. Le défaut est entièrement dans la couche
d'autorisation ; les données sont déjà correctement rattachées à `churchId` (à l'exception
assumée du module emploi, cf. ci-dessous).

## API

Aucun endpoint ajouté, supprimé ni modifié dans son contrat : **méthodes, entrées, sorties
et permissions requises sont inchangées**. Seul le *périmètre d'évaluation* de la permission
change. Un utilisateur mono-église ne verra aucune différence.

Les 23 routes à requalifier, par module :

| Module | Fichiers | Permission | Église cible |
|---|---|---|---|
| Accueil (welcome-duty) | 6 | `events:manage` | contexte courant validé |
| Réservations (mrbs-links) | 2 | `mrbs:manage` | contexte courant validé |
| Comptabilité | 4 | `accounting:view` / `accounting:submit` | contexte courant validé |
| Audio (paramètres) | 2 | `audio:manage` | contexte courant validé |

Pour les routes agissant sur un **objet identifié**, l'église est résolue depuis l'objet via
`resolveChurchId` (déjà existant) et non depuis le contexte affiché — conformément au
critère « l'église de l'objet fait autorité ».

## Services / logique métier

Tout se joue dans `src/lib/auth.ts` ; aucun service métier n'est touché, aucun événement de
bus émis.

1. **Supprimer** `requirePermission`. Le compilateur recense alors exhaustivement les
   appelants : la migration devient pilotée par `npm run typecheck`, pas par un `grep`.

2. **Ajouter `requireCurrentChurchPermission(permission)`** — résout le contexte d'église
   courant puis délègue à `requireChurchPermission`, et retourne `{ session, churchId }`.
   C'est le remplaçant ergonomique des 23 appels : il évite de réécrire partout le couple
   « résoudre le contexte, puis vérifier », qui est précisément l'endroit où l'erreur se
   glissait. Il ne peut pas être mal utilisé : il ne rend jamais un `churchId` sur lequel la
   permission n'a pas été vérifiée.

3. **Ajouter `requireSuperAdmin()`** — pour les 4 pages `church:manage`, conformément à la
   décision « actions transverses réservées au Super Admin ».

4. **Ajouter `requirePlatformPermission(permission)`** — garde explicite pour le module
   emploi, accompagnée d'une liste blanche des permissions autorisées à être transverses.
   Nommée pour être visible en revue : une portée globale devient un acte délibéré.

5. **`getCurrentChurchId` est conservé tel quel.** Sa permissivité (il accepte une valeur
   d'origine cliente) cesse d'être exploitable dès lors que la permission est évaluée dans
   l'église qu'il retourne : au pire l'utilisateur désigne une église où il a un rattachement
   légitime, et la permission y est vérifiée normalement. Le durcir en plus serait une
   défense redondante — mais un commentaire documentera qu'il retourne un **contexte
   d'affichage, jamais une autorisation**.

### Cas particulier : le module emploi

Les modèles emploi (`JobSeeker`, `FreelanceMission`, `FreelanceProfile`) n'ont **pas** de
`churchId` : ce domaine est transverse par conception, les annonces étant rattachées à leur
auteur. Ces 4 appels ne sont donc **pas** des défauts. Les traiter comme church-scoped
casserait la fonctionnalité ; les laisser en portée implicite reproduirait le défaut. D'où
la garde dédiée, qui rend cette intention lisible et énumérable.

## UI / composants

Le même défaut existe côté navigation, avec la même cause. Dans `src/app/(auth)/layout.tsx`,
les droits d'affichage sont calculés à partir de **tous** les rôles, toutes églises
confondues :

```
const userRoles = churchRoles.map((r) => r.role);
```

La barre latérale de l'église B propose donc les liens d'administration parce que la
personne est Admin dans A. C'est exactement le critère « actions masquées » retenu.

Correction : restreindre ce calcul aux rôles détenus **dans l'église courante**. Aucun
composant nouveau, aucune modification de `src/components/ui/`. Le masquage reste un confort
d'affichage — les gardes serveur ci-dessus demeurent la protection réelle, y compris sur
accès direct à l'URL.

## Décisions & alternatives écartées

- **Choix** : supprimer `requirePermission` — *Pourquoi* : c'est le seul moyen d'obtenir la
  garantie demandée par la spec. Le compilateur devient le mécanisme d'application, et la
  migration est exhaustive par construction.
- **Choix** : réutiliser `requireChurchPermission` — *Pourquoi* : il porte déjà la bonne
  sémantique, supervision pastorale comprise. Écrire un nouveau garde dupliquerait cette
  logique subtile et risquerait de la diverger.
- **Choix** : garde dédiée pour le domaine transverse — *Pourquoi* : rend les portées
  globales énumérables (critère d'acceptation) au lieu de les confondre avec des oublis.
- **Écarté** : rendre `churchId` obligatoire en gardant le nom `requirePermission` —
  *Raison* : une signature qui change sans que le nom change laisse passer les appels
  fournissant un `churchId` erroné par copier-coller, et n'aide pas à la revue.
- **Écarté** : une règle ESLint interdisant l'appel sans église — *Raison* : contournable,
  et surtout inutile si le symbole n'existe plus. Une erreur de compilation est plus forte
  qu'un avertissement de lint.
- **Écarté** : durcir `getCurrentChurchId` pour qu'il exige une permission — *Raison* :
  confondrait « quelle église je regarde » et « qu'ai-je le droit d'y faire », les deux
  responsabilités dont la fusion a créé le défaut.
- **Écarté** : ajouter un `churchId` aux modèles emploi — *Raison* : hors périmètre de la
  spec et changerait une fonctionnalité volontairement transverse.

## Risques & points d'attention

- **Risque principal — régression fonctionnelle silencieuse.** Une personne légitimement
  Admin qui perdrait un accès par un `churchId` mal résolu. Mitigation : le contexte courant
  reste la source par défaut, donc le comportement mono-église est strictement identique ;
  la couverture de tests ci-dessous cible précisément ce cas.
- **Volume de la migration** : 31 appels dans 7 modules. Chaque site doit être requalifié
  **individuellement** — la catégorie ne se déduit pas mécaniquement de la permission
  demandée. Un remplacement automatisé est explicitement déconseillé.
- **Angle mort connu** : ce plan ne traite pas l'autorisation au niveau de chaque objet
  (accès par identifiant deviné, constats H-02/H-03 de l'audit). Une route correctement
  scopée à une église peut encore exposer un objet d'un autre périmètre à l'intérieur de
  celle-ci. Hors périmètre assumé, à ne pas confondre avec « corrigé ».
- **Profils pastoraux** : le chemin actuel leur ouvre l'écriture sur une église supervisée
  lorsqu'ils ont un rôle ailleurs. Après correction ils repassent en lecture seule stricte —
  c'est l'intention documentée, mais **un usage réel s'appuie peut-être sur ce défaut**. À
  signaler avant déploiement.
- Aucune migration de données, aucun risque de perte ; la correction est réversible par
  simple retour arrière du code.

## Stratégie de tests

L'audit relève (Q-01) qu'aucun test ne démontre l'isolation multi-tenant : la couverture est
donc un livrable, pas un accompagnement.

**Socle commun** : une session factice à deux églises — rôle privilégié dans A, rôle moindre
dans B — réutilisée par tous les cas.

1. **Isolation (le cœur)** — `requireChurchPermission("x:manage", B)` refuse alors que le
   rôle dans A porte cette permission ; la même vérification sur A réussit. En **lecture**
   comme en **écriture**.
2. **Non-régression mono-église** : une session à une seule église conserve exactement ses
   accès.
3. **Super Admin** : conserve l'accès sur A comme sur B.
4. **Supervision pastorale** : lecture autorisée sur l'église supervisée ; **écriture
   refusée**, y compris lorsque la session détient un rôle privilégié dans une autre église
   (le cas exposé aujourd'hui — ce test échoue sur le code actuel, ce qui vaut preuve du
   défaut).
5. **Contexte manipulé** : un contexte d'église sans rattachement ne devient jamais le
   périmètre de l'action.
6. **Portées globales énumérables** : un test lit les appels aux gardes globales
   (`requireSuperAdmin`, `requirePlatformPermission`) et les compare à une liste blanche
   commitée. Tout nouvel usage fait échouer la suite tant qu'il n'est pas justifié — c'est ce
   qui rend le critère « énumérable » vérifiable dans le temps plutôt qu'à un instant donné.
7. **Absence de fuite** : le refus dans B est indiscernable de celui opposé à une session
   sans aucun droit (même erreur, même message).

Tests unitaires Vitest, sans base réelle, sur le modèle de `src/lib/__tests__/auth-security.test.ts`.
La suppression de `requirePermission` est elle-même validée par `npm run typecheck`.
