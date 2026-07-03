# Spec — Refonte de l'onboarding : liaison compte ↔ STAR par email (anti-doublon)

- **Numéro** : 002
- **Statut** : Validée
- **Créée le** : 2026-07-03
- **Branche suggérée** : `feat/onboarding-liaison-email`

> ⚠️ Cette spec décrit **QUOI** et **POURQUOI** — jamais **COMMENT**.

## Contexte & problème

Quand une nouvelle personne rejoint une église dans Koinonia, deux entités la représentent :
son **compte utilisateur** (créé à la connexion Google) et sa **fiche STAR/membre** (créée par un
responsable). Ces deux entités doivent être **liées** pour que la personne voie ses services et ses
départements. Aujourd'hui cette liaison est fragile et **génère des doublons** :

- La fiche membre est créée **sans email** ; il n'existe donc aucun point de rapprochement fiable
  avec le futur compte.
- À la connexion, **rien ne rapproche** le compte d'une fiche existante : la personne arrive sans
  rôle ni lien.
- Le parcours d'auto-rattachement propose des fiches **par nom uniquement**. En cas d'homonyme,
  faute de frappe ou accent, la personne ne se reconnaît pas, choisit « je ne suis pas encore
  enregistré », et une **seconde fiche est créée** alors qu'une existait déjà.
- Une même personne servant dans **plusieurs églises** possède plusieurs fiches, sans lien commun.

Résultat : des fiches en double, des comptes non reliés, un travail de fusion *a posteriori*
récurrent pour les administrateurs. La cause racine : **on laisse la personne se réclamer par son
nom, au lieu de la rattacher par son email** — alors que l'email de son compte est vérifié et unique.

Cette refonte fiabilise l'onboarding **self-service** en faisant de l'**email la clé d'identité** de
la personne, pour supprimer les doublons à la source.

## Utilisateurs concernés

- **Nouvel arrivant** (STAR, ou titulaire d'un rôle sans fiche STAR) : se connecte, est rattaché à
  la bonne fiche de façon fiable, sans re-saisie inutile.
- **Responsable / administrateur** : crée les fiches membres (désormais avec email), valide les
  demandes de rattachement restantes, et n'a plus à fusionner des doublons évitables.

## Comportement attendu

### Scénario principal — rattachement par email confirmé

1. Une personne se connecte pour la première fois (Google, email vérifié).
2. Le système recherche, **par cet email**, les fiches membres **non encore liées** — dans toutes
   les églises où une fiche porte cet email.
3. Si une correspondance est trouvée, le système **propose** la ou les fiches concernées :
   *« Cette fiche vous correspond-elle ? »* (nom, église, département).
4. La personne **confirme**. Le rattachement est alors **établi directement** — l'email ayant été
   renseigné par un responsable sur la fiche, cette confirmation suffit (pas de nouvelle validation
   administrative). La personne obtient l'accès correspondant (rôle STAR par défaut).
5. Si la personne sert dans plusieurs églises, chaque fiche correspondante lui est proposée ; les
   rattachements confirmés sont établis **par église**, tous rattachés au même compte.

### Scénario alternatif — aucune correspondance par email (recherche avant création)

1. Aucune fiche ne porte l'email de la personne.
2. La personne indique son intention : **« je suis un STAR »** ou **« je veux un rôle sans fiche
   STAR »**.
3. Si **« je suis un STAR »** : le système bascule en **mode recherche** — il recherche les fiches
   non liées (par nom, et toute information complémentaire fournie) et **présente les candidats**.
   - Si la personne **reconnaît une fiche** → demande de rattachement à cette fiche **existante**.
   - **Seulement si aucune ne correspond**, et après confirmation explicite de la personne
     (« aucune de ces fiches n'est la mienne »), le système propose la **création d'une nouvelle
     fiche**.
4. La demande obtenue (rattachement à une fiche existante, création d'une nouvelle fiche, ou rôle
   sans STAR) suit le circuit de **validation par un administrateur** (comportement conservé).

> Le point clé de ce scénario : l'action « nouveau STAR » ne mène **jamais directement** à une
> création. Elle passe **toujours** par une recherche préalable — la création n'est qu'un dernier
> recours explicite. C'est ce qui supprime le doublon né du réflexe « je ne suis pas enregistré ».

### Scénario — rôle sans fiche STAR (autorisation)

Certaines personnes ont besoin d'un **rôle sans servir dans un département** (Reporter, Faiseur de
Disciples, Ministre, Responsable de département…). Ce cas relève de l'**autorisation**, pas de
l'identité, et se distingue des scénarios ci-dessus :

1. **La réconciliation par email est tentée en premier, quelle que soit l'intention.** Si l'email
   correspond à une fiche STAR non liée, elle est **proposée** (un responsable de département est
   souvent aussi un STAR) — la personne peut la rattacher, ou indiquer qu'elle ne sert dans aucun
   département.
2. La demande de rôle sans STAR est **toujours soumise à la validation d'un administrateur** : aucune
   attribution automatique, car accorder un rôle est une **élévation de privilège** (à la différence
   du simple rattachement d'identité STAR).
3. **Identité et autorisation sont dissociées** : si une fiche STAR a été rattachée à l'étape 1
   (par email confirmé), ce lien est établi immédiatement ; la demande de **rôle élevé** part, elle,
   en validation admin — la personne n'est pas bloquée en attendant.

### Garde-fou anti-doublon (à la création d'une fiche)

- Lorsqu'on s'apprête à **créer une nouvelle fiche membre** (par un responsable, ou à l'issue d'une
  demande « STAR non enregistré »), le système **alerte/bloque** si une fiche de la même église
  porte déjà le **même email** ou un **nom identique**, et propose de rattacher à l'existante plutôt
  que d'en créer une nouvelle.

### Cas limites

- **Email absent sur une fiche** : la fiche reste rattachable par le parcours par nom (scénario
  alternatif) ; elle n'apparaît simplement pas dans le rapprochement par email.
- **Personne sans email** (enfant, membre sans adresse) : la fiche existe sans email ; aucun compte
  ne lui sera rattaché automatiquement — comportement acceptable.
- **La confirmation ne modifie jamais d'autres fiches** : confirmer un rattachement n'affecte que le
  lien de la personne pour l'église concernée.

## Critères d'acceptation

- [ ] La création d'une fiche membre **capture l'email** (champ de première classe, **fortement
      incité mais non bloquant**, utilisable pour le rapprochement).
- [ ] À la connexion, le rapprochement s'effectue **d'abord par l'email vérifié** du compte, sur
      toutes les églises.
- [ ] Quand une fiche correspond par email, elle est **proposée** ; après confirmation de la
      personne, le **rattachement est établi directement**, sans validation administrative
      supplémentaire.
- [ ] En l'absence de correspondance par email, le parcours **par nom** reste disponible et passe
      par la **validation administrateur** (aucune régression).
- [ ] Le choix **« je suis un STAR »** déclenche **d'abord une recherche** des fiches existantes ; la
      **création** d'une nouvelle fiche n'est offerte qu'**après** que la personne a confirmé
      qu'aucune candidate ne lui correspond (jamais de création directe).
- [ ] La **réconciliation par email est tentée en premier quelle que soit l'intention** (y compris
      pour une demande de rôle sans STAR) : une fiche correspondante est toujours proposée.
- [ ] Une demande de **rôle sans fiche STAR** (Reporter, Faiseur de Disciples, Ministre, Resp.
      département…) est **toujours validée par un administrateur** — **jamais d'auto-attribution**.
- [ ] **Identité et autorisation sont dissociées** : un rattachement STAR par email confirmé est
      établi immédiatement, même si une demande de rôle élevé associée reste en attente de validation.
- [ ] La création d'une nouvelle fiche est **bloquée/alertée** si l'email ou le nom existe déjà dans
      l'église, avec proposition de rattacher à l'existante.
- [ ] Une même personne peut être rattachée dans **plusieurs églises** au même compte (multi-tenant
      préservé).
- [ ] Les rattachements établis et les demandes sont **journalisés** (traçabilité).

## Hors périmètre

- **Pas d'invitation administrateur / pré-provisionnement** : l'onboarding reste self-service
  (déclenché par la personne à sa connexion).
- **Pas d'entité « personne physique » transverse** : l'identité de la personne reste portée par son
  compte (email) ; les fiches restent des adhésions par église liées à ce compte.
- Le **workflow de validation** des demandes sans correspondance email (STAR non enregistré, rôle
  sans STAR) n'est pas refondu — seulement complété par le rapprochement email en amont.
- La **fusion curative** des doublons existants n'est pas l'objet (elle demeure disponible) ; cette
  spec vise à **prévenir** les nouveaux doublons.
- La **correction du nom d'affichage par église** (dette du `displayName` global, cf.
  `docs/security-exceptions.md`) est **traitée séparément** : elle est connexe mais n'est pas une
  cause des doublons. Le comportement actuel du `displayName` est conservé tel quel par cette spec.

## Décisions arrêtées

- **Email = clé d'identité** de la personne (l'ancre est l'email vérifié du compte, déjà unique).
- **Self-service amélioré uniquement** : pas d'invitation admin.
- **Rapprochement email « proposition à confirmer »** : la personne confirme la correspondance ;
  cette confirmation suffit à établir le lien (l'email ayant été saisi par un responsable).
- **Multi-tenant sans nouvelle entité** : rattachements par église sur un même compte.
- **Email fortement incité, non bloquant** : une fiche peut être créée sans email (membre sans
  adresse) ; elle reste rattachable par le parcours par nom.
- **Garde-fou nom = alerte + proposition de rattachement** : en cas de nom identique/proche dans
  l'église à la création, le système alerte et propose de rattacher à l'existante, mais
  l'administrateur garde le dernier mot (pas de blocage dur ni d'info discriminante exigée).
- **« Nouveau STAR » = recherche d'abord** : l'action « je suis un STAR » bascule en mode recherche
  et ne propose la création qu'en dernier recours, après confirmation qu'aucune fiche ne correspond.
  La prévention est donc **en amont** (parcours), doublée du garde-fou serveur à la création.
- **Identité ≠ autorisation** : le rattachement d'une fiche STAR (identité) peut être automatique
  sur correspondance email confirmée ; l'attribution d'un **rôle** (autorisation) est **toujours**
  validée par un administrateur — jamais automatique. La réconciliation par email précède toujours
  le choix du rôle.
