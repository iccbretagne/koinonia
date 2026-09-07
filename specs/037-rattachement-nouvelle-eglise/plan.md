# Plan technique — Rattachement d'une personne à une nouvelle église

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-07

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module. Voir la décision
      « emplacement du service d'admission » — **point d'arbitrage signalé**, la constitution dit
      `src/modules/X/services/` et ce plan propose `src/lib/`.
- [x] **Sécurité** : toutes les routes touchées restent gardées ; `churchId` jamais optionnel.
      Une route nouvelle (`/api/churches/resolve`) est en `requireAuth()` **délibérément** —
      justifié plus bas, précédent existant assumé dans le code.
- [x] **Permissions** via `rolePermissions` — aucune permission nouvelle, aucune matrice modifiée.
- [x] **Validation** Zod sur toutes les mutations.
- [x] **Migration** Prisma : **aucune** — le modèle actuel suffit.
- [x] **Enums** depuis `@/generated/prisma/client` (`Role`).
- [x] **UI** : `Modal`, `Input`, `Button` réutilisés ; `NoAccessClient` réutilisé tel quel.

## Approche générale

Le fil directeur tient en une phrase : **il n'y a qu'une seule admission, et les deux chemins y
mènent**.

L'exploration du code a établi que la transaction d'admission existe déjà en entier dans
l'approbation d'une demande de rattachement (`src/app/api/member-link-requests/[id]/route.ts`) —
création du STAR si besoin, lien STAR↔compte, `displayName`, rôles demandés, **et l'attribution
automatique du rôle `STAR` si la personne n'a encore aucun rôle dans l'église** :

```ts
// ── Auto-assigner le rôle STAR si aucun rôle dans l'église ─────────────
if (!isNoStarRole && memberId) {
  const hasAnyRole = await tx.userChurchRole.findFirst({ where: { userId, churchId } });
  if (!hasAnyRole) {
    await tx.userChurchRole.create({ data: { userId, churchId, role: "STAR" } });
  }
}
```

La décision de la spec — « l'admission accorde l'accès de base du STAR » — est donc **déjà
implémentée**. Il n'y a rien à concevoir de ce côté : il faut l'extraire pour la rendre
appelable, et brancher les deux chemins dessus.

Le travail réel se réduit alors à trois gestes :

1. **Extraire** la transaction d'admission dans une fonction réutilisable, et faire de la route
   d'approbation son premier appelant (comportement inchangé, couvert par des tests).
2. **Chemin admin** : lever le verrou d'écriture, qui exige aujourd'hui le rattachement qu'on
   cherche précisément à créer, et faire de la liaison une admission complète.
3. **Chemin utilisateur** : débloquer le sélecteur d'église du profil par saisie d'identifiant.

Le reste de la chaîne du chemin utilisateur **fonctionne déjà** — vérifié, voir ci-dessous.

### Ce qui marche déjà et n'a pas besoin d'être touché

- `POST /api/member-link-requests` accepte **n'importe quel `churchId`** : aucun rôle préalable
  n'est exigé. Seul l'écran de profil bride, pas la règle métier.
- `GET /api/members/search` est en `requireAuth()` **volontairement**, avec un commentaire qui
  l'explique : *« un nouvel arrivant en onboarding n'a AUCUN accès à l'église, donc `requireAuth()`
  et non `requireChurchAccess()` — sinon la recherche renvoie 403 pour exactement ceux qui en ont
  besoin »*. Choisir sa fiche STAR dans une église où l'on n'a aucun rôle marche donc déjà.
- `NoAccessClient` est le formulaire multi-étapes déjà partagé par `/no-access` et `/profile`. Il
  prend `churches` et `ministries` en props : lui passer **une** église résolue suffit.
- `allowDangerousEmailAccountLinking: true` est actif sur le provider Google (`src/lib/auth.ts:80`).
  Un compte pré-créé à partir d'une adresse email se liera donc bien à la première connexion
  Google — le cas « adresse inconnue » de la spec est techniquement viable. Sans ce réglage, on
  aurait fabriqué des comptes fantômes impossibles à connecter.

## Modèle de données

**[Aucun changement]** — aucune migration.

L'identifiant public de l'église existe déjà : c'est `Church.slug` (`@unique`), déjà utilisé
comme identifiant à communiquer par la spec 036 (`GET /api/audio/shares` le renvoie sous
`ownSlug`). On réutilise le même identifiant, pas un nouveau code.

`MemberUserLink`, `MemberLinkRequest`, `UserChurchRole` couvrent tout le reste.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/users/search` | GET | `members:manage` (churchId) | `q`, `churchId` | liste ; ajout d'une correspondance **email exacte** cross-église |
| `/api/member-user-links` | POST | `members:manage` (churchId) | `{ memberId, churchId, userId? \| email?, confirmCreate? }` | lien créé + admission complète |
| `/api/churches/resolve` | POST | `requireAuth()` + débit limité | `{ slug }` | `{ id, name, ministries[] }` |
| `/api/member-link-requests` | POST | `requireAuth()` | inchangé | inchangé |
| `/api/member-link-requests/[id]` | PATCH | `members:manage` | inchangé | inchangé (délègue au service) |

### `/api/users/search` — correspondance email exacte

Reprise intégrale du diff de la PR #524 (fermée) : recherche par nom inchangée et toujours bornée
à l'église, plus une correspondance **exacte** sur l'email, hors périmètre d'église, déclenchée
seulement si la requête contient `@`. Aucun `contains` sur l'email : c'est ce qui distingue une
levée de doute sur une adresse connue d'un outil d'énumération.

### `/api/member-user-links` — le verrou à lever

Le contrôle actuel (`route.ts:34-40`) exige que le compte ait déjà un rôle ou une demande dans
l'église — la condition même que l'on cherche à créer. Il est remplacé par :

- résolution de la cible : `userId` fourni, **ou** `email` exact ;
- si l'email ne correspond à aucun compte : réponse 409 avec un marqueur explicite, et création
  seulement si le client renvoie `confirmCreate: true` (double confirmation exigée par la spec) ;
- puis appel du service d'admission, en transaction.

La garde de permission (`members:manage` sur `churchId`) et les refus métier existants (STAR déjà
lié, compte déjà lié dans cette église) sont **conservés tels quels**.

### `/api/churches/resolve` — surface d'énumération unique et assumée

Le chemin utilisateur a besoin de traduire un identifiant en église **avant** de choisir une fiche
STAR. Un endpoint dédié, plutôt qu'une résolution en deux temps dans le POST de demande, parce
que l'écran a besoin du `churchId` pour l'étape suivante (recherche de STAR).

- `requireAuth()` seul : par construction l'appelant n'a aucun rôle dans l'église visée. Exiger
  une permission reviendrait à refuser exactement ceux à qui la fonctionnalité s'adresse — même
  raisonnement que celui déjà écrit dans `/api/members/search`.
- `requireRateLimit(..., RATE_LIMIT_SENSITIVE)` (10/min, `src/lib/rate-limit.ts:52`), clé par
  utilisateur : c'est le seul rempart contre la reconstitution de l'annuaire par sondage.
- Renvoie le strict nécessaire au formulaire : nom de l'église, ministères et départements
  (noms et identifiants). Aucune donnée de personne.
- Refuse une église où l'appelant a déjà un rôle ou une demande en attente.

## Services / logique métier

### `admitToChurch()` — extraction de la transaction d'admission

Extraction de la transaction de `PATCH /api/member-link-requests/[id]` en fonction autonome,
recevant le client transactionnel Prisma. Signature visée :

```
admitToChurch(tx, {
  userId, churchId, memberId?, newMember?, requestedRole?, validatedById
}) → { memberId, createdRole }
```

Elle porte : création du `Member` si nouveau, `MemberUserLink`, `displayName`, rôle demandé
(Ministre / Responsable / Faiseur de disciples / Reporter), **rôle `STAR` par défaut si aucun
rôle**, et les validations d'appartenance département/ministère → église.

**Appelants** : la route d'approbation (comportement strictement inchangé) et
`POST /api/member-user-links`. L'audit et les notifications restent chez les appelants — ils
diffèrent : approbation d'une demande d'un côté, rattachement direct de l'autre.

### `resolveChurchBySlug()`

Résolution `slug` → église + structure, refus si l'appelant y a déjà un rôle ou une demande.

## UI / composants

### `/profile` — « Rejoindre une nouvelle église »

`src/app/(auth)/profile/page.tsx:11-13` construit la liste des églises à partir de
`session.user.churchRoles` : c'est **le seul verrou** du chemin utilisateur. On ne l'élargit pas
— on ajoute une section, en composant client :

1. `Input` pour l'identifiant + `Button` « Vérifier ».
2. Le nom de l'église résolue s'affiche pour confirmation (aucune liste, aucune autocomplétion).
3. Après confirmation, `NoAccessClient` est monté avec cette **unique** église et ses ministères,
   tel quel — aucune modification du composant.

La section existante (demande dans une église où l'on a déjà un rôle) reste inchangée.

### `/admin/members` — modale « Lier un compte »

`MembersClient.tsx` : le placeholder « Nom ou email… » redevient exact. Quand la saisie contient
`@` et qu'aucun compte ne correspond, un encart propose explicitement de rattacher tout de même
l'adresse (`confirmCreate`), avec le fait que la personne sera admise à sa première connexion.
`Modal`, `Input`, `Button` existants.

## Décisions & alternatives écartées

- **Choix** : réutiliser la transaction d'admission existante en l'extrayant — *Pourquoi* : elle
  porte déjà le rôle `STAR` par défaut, le garde-fou anti-doublon, les validations d'appartenance.
  La réécrire, même partiellement, garantissait la divergence entre les deux chemins.
- **Écarté** : faire du chemin admin une demande auto-approuvée (créer une `MemberLinkRequest`
  puis l'approuver dans la foulée) — *Raison* : fabrique une demande que la personne n'a jamais
  faite et pollue l'historique des demandes de l'église. La traçabilité est assurée par le
  journal d'audit, qui est fait pour ça.
- **Choix** : `src/lib/admission.ts` pour le service partagé — *Pourquoi* : précédent direct avec
  `src/lib/onboarding.ts`, qui porte déjà exactement ce type de logique métier partagée
  (`findDuplicateCandidates`, `rankMembersByName`) et qui est appelé par ces mêmes routes.
  **Entorse assumée à la constitution I** (« la logique métier vit dans `src/modules/X/services/` »),
  à arbitrer : `src/modules/core/` n'a aujourd'hui **aucun** service, et la règle de frontières
  `app-only-module-public-api` n'autorise que deux points d'entrée par module (`index.ts`,
  `auth.ts`). Exporter l'admission par `core/index.ts` ferait entrer Prisma dans le graphe du
  registry, ce que la configuration cherche explicitement à éviter pour les tests unitaires.
  Ouvrir un troisième point d'entrée est une décision structurante qui relève du chantier 2 de
  `docs/roadmap-modularite.md` et d'un ADR — pas de cette feature.
- **Choix** : ne plus écraser `displayName` s'il est déjà renseigné — *Pourquoi* : aujourd'hui un
  rattachement dans l'église B écrase le nom défini par l'église A. C'est une limitation déjà
  consignée dans `docs/security-exceptions.md`, mais cette feature la ferait passer de rare à
  courante : le rattachement multi-église est précisément son objet. Un garde d'une ligne.
- **Écarté** : exiger un consentement de la personne sur le chemin admin — *Raison* : la spec
  décrit une admission directe suivie d'une notification. Voir les risques.

## Risques & points d'attention

- **L'annuaire des églises est déjà exposé ailleurs — à arbitrer.** `src/app/no-access/page.tsx:17`
  fait un `findMany()` **sans filtre** sur les églises : tout utilisateur n'appartenant à aucune
  église voit aujourd'hui la liste complète de la plateforme, avec ses ministères. L'invariant de
  la spec 036 tient à la lettre (il vise les *administrateurs*, et cette page leur est
  inaccessible — redirection si `churchRoles.length > 0`), mais la décision (a) a été prise sur
  l'idée que la liste n'était exposée nulle part. Elle l'est, pour les nouveaux venus. La décision
  (a) reste la plus stricte et ce plan l'applique — mais si l'objectif était la cohérence plutôt
  que la fermeture, réutiliser la liste de `/no-access` dans `/profile` serait nettement plus
  simple. **À confirmer avant implémentation.**
- **Aucun consentement sur le chemin admin.** Un administrateur peut rattacher unilatéralement une
  adresse connue à son église. Atténuations : notification à la personne, journal d'audit,
  révocation déjà possible. Ce qu'elle expose à l'église B se limite à son nom et son adresse.
  Si ce n'est pas acceptable, il faut basculer le chemin A en demande soumise à acceptation —
  changement de spec, pas de plan.
- **Le débit limité devient le seul rempart.** `RATE_LIMIT_SENSITIVE` (10/min) était calibré pour
  des administrateurs sur le partage audio ; il gardera ici une surface ouverte à tout utilisateur
  authentifié. La valeur doit être revue consciemment, pas héritée par défaut.
- **Le compteur du cliquet Prisma va bouger.** Si les routes délèguent au service partagé et
  cessent d'importer Prisma, `scripts/prisma-boundary-baseline.txt` doit être **abaissé** dans le
  même commit — sinon la CI échoue, par conception.
- **Régression possible sur l'approbation.** L'extraction touche le chemin le plus chargé du
  domaine. Il doit être couvert par des tests **avant** l'extraction, pas après.

## Stratégie de tests

- **`src/lib/__tests__/admission.test.ts`** — le cœur. Rôle `STAR` attribué si aucun rôle,
  **non** attribué si un rôle existe déjà ; création du `Member` pour un nouveau STAR ; refus si
  le département ou le ministère n'appartient pas à l'église ; `displayName` non écrasé s'il
  existe.
- **`member-link-requests/[id]` (approbation)** — tests de non-régression écrits **avant**
  l'extraction, pour prouver que le comportement est identique après.
- **`member-user-links`** — un compte sans aucun rattachement dans l'église est admis et **reçoit
  un rôle** (le test qui aurait attrapé le défaut de la PR #524) ; refus conservés (STAR déjà lié,
  compte déjà lié) ; création sur email inconnu seulement avec `confirmCreate`.
- **`users/search`** — les quatre tests de la PR #524, repris tels quels.
- **`churches/resolve`** — identifiant inconnu ne révèle rien ; refus si l'appelant a déjà un rôle
  ou une demande ; débit limité effectif.
- **Multi-tenant** — une admission dans l'église B ne modifie aucun rôle ni lien dans l'église A.

Mocks Prisma existants (`src/__mocks__/prisma`), pas de base de test.
