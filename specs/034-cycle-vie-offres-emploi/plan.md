# Plan technique — Cycle de vie des offres d'emploi

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : le service de cycle de vie vit dans
      `src/modules/jobs/services/` et n'est atteint que par l'index (`@/modules/jobs`) —
      l'orchestrateur cron l'importe comme il importe déjà
      `runInactivityNotifications` de `@/modules/integration`.
- [x] **Sécurité** : la route de confirmation réutilise la garde existante de
      `PATCH /api/jobs/[id]` (auteur **ou** Super Admin / Admin / Secrétaire). Le
      traitement automatique est protégé par le `CRON_SECRET` de l'orchestrateur, inchangé.
      *Multi-tenant : sans objet* — `JobOffer` n'a pas de `churchId`, le module emploi est
      volontairement transverse (liste blanche testée dans `auth-global-scopes.test.ts`).
- [x] **Permissions** via `rolePermissions` : aucune permission créée ni modifiée. La garde
      de `PATCH /api/jobs/[id]` est réutilisée telle quelle.
- [x] **Validation Zod** : le champ de confirmation est ajouté au `patchSchema` existant de
      `PATCH /api/jobs/[id]`.
- [x] **Migration Prisma** : **une migration est nécessaire** (`renewalRequestedAt` sur
      `JobOffer`), générée par `npm run db:migrate` — jamais `db push`. Voir **prérequis**.
- [x] **Enums** depuis `@/generated/prisma/client` : aucun enum nouveau. `JobOfferStatus`
      est inchangé (décision de la spec), et `Notification.type` est une colonne `String`
      libre — le nouveau type de notification n'exige donc **aucune** migration.
- [x] **UI** : le bandeau et le bouton s'insèrent dans `JobDetailClient` avec le style local
      déjà en place ; aucun composant UI générique créé.

> ⚠️ **Prérequis d'implémentation** : Docker est actuellement **arrêté** sur le poste. La
> migration Prisma ne peut pas être générée en l'état — `docker-compose up -d` est un
> préalable à la première tâche.

## Approche générale

La spec demande deux transitions temporelles sur une offre publiée : **relancer** à 60 jours
d'inactivité, **archiver** 14 jours après une relance sans réponse. Le fil directeur tient
en trois choix :

1. **Un seul champ ajouté**, `renewalRequestedAt`. La date de référence du cycle de 60 jours
   n'est pas un nouveau champ : c'est `updatedAt`, déjà présent. Ce raccourci n'est légitime
   que parce que la spec a tranché « **modifier vaut confirmation** » — `updatedAt` *est*
   donc, par définition, la date de dernière manifestation de l'auteur (cf. **D1**).
2. **Le champ lui-même sert de mémoire anti-doublon.** Une offre en attente de réponse a
   `renewalRequestedAt` renseigné ; la requête de relance exige qu'il soit `NULL`. Aucune
   relecture de l'historique des notifications n'est nécessaire, contrairement au précédent
   MSDP (cf. **D2**).
3. **Deux passes, archivage d'abord.** On ne relance pas une offre qu'on s'apprête à
   archiver dans le même passage (cf. **D3**).

## Modèle de données

Une seule colonne ajoutée, nullable — pas de valeur par défaut à rétro-remplir :

```prisma
model JobOffer {
  // … champs existants inchangés
  status             JobOfferStatus @default(PUBLISHED)

  /// Date d'envoi de la relance « toujours d'actualité ? » restée sans réponse.
  /// NULL = aucune relance en cours (cas nominal). Remis à NULL par toute
  /// modification de l'offre, qui vaut confirmation (spec 034).
  renewalRequestedAt DateTime?

  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  @@index([status, type])
  @@index([authorId])
  @@index([status, renewalRequestedAt]) // sert les deux requêtes du traitement périodique
  @@map("job_offers")
}
```

Migration : `npm run db:migrate` → `job_offer_renewal_tracking`.

**Rien à rétro-remplir.** Les offres existantes arrivent avec `renewalRequestedAt = NULL`,
ce qui est exactement l'état « aucune relance en cours ». C'est ce qui garantit
mécaniquement le critère « aucune offre visible n'est archivée le jour de la mise en
service » : la condition d'archivage porte sur `renewalRequestedAt`, et `NULL` ne satisfait
aucune comparaison (cf. **risque n°2** pour la nuance sur les offres à date limite dépassée).

## API

| Endpoint | Méthode | Permission | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/jobs/[id]` | **PATCH** *(existant, étendu)* | Garde existante : auteur **ou** Super Admin / Admin / Secrétaire | `patchSchema` + `renew: z.literal(true).optional()` | L'offre mise à jour |
| `/api/cron` | **POST** *(existant, étendu)* | `CRON_SECRET` | — | Ajoute une clé `jobOffersLifecycle` au compte rendu |

**Aucun nouvel endpoint.** La confirmation passe par le `PATCH` existant, dont la garde
répond déjà exactement à l'exigence de la spec (« l'auteur, ou un modérateur, et personne
d'autre »).

Deux points d'implémentation sur le `PATCH` :

- `renew` est un **marqueur de requête, pas une colonne** : il doit être retiré du payload
  avant le `update` Prisma, sous peine d'erreur sur un champ inconnu.
- **Toute** requête `PATCH` acceptée met `renewalRequestedAt: null`, que `renew` soit
  présent ou non — c'est la traduction directe de « modifier vaut confirmation ». Une seule
  ligne couvre donc les deux chemins (bouton dédié et modification ordinaire), et la
  republication d'une offre archivée en bénéficie sans code supplémentaire.

## Services / logique métier

### `src/modules/jobs/services/lifecycle-service.ts` (nouveau)

Le module `jobs` ne contient aujourd'hui **que** son manifeste (`index.ts`) : le dossier
`services/` est à créer, ce qui aligne le module sur `integration` et `rooms`.

```
RENEWAL_AFTER_DAYS = 60
ARCHIVE_AFTER_RENEWAL_DAYS = 14
RENEWAL_NOTIF_TYPE = "JOB_OFFER_RENEWAL"

runJobOffersLifecycle(appUrl) → { archived, renewalsSent, emailFailures }
```

**Passe 1 — archivage** (exécutée en premier) :

```
status = PUBLISHED
ET ( renewalRequestedAt < maintenant − 14 j
     OU deadline < maintenant )
→ status = ARCHIVED
```

Un `updateMany` suffit : aucune notification, aucun email (la spec exclut explicitement un
message « votre offre a été archivée »).

**Passe 2 — relance** :

```
status = PUBLISHED
ET renewalRequestedAt EST NULL
ET updatedAt < maintenant − 60 j
ET ( deadline EST NULL OU deadline ≥ maintenant )
→ renewalRequestedAt = maintenant, puis email + notification
```

Pour chaque offre : notification en base (toujours), puis email (si `SMTP_HOST` et adresse
de l'auteur disponibles), **chaque envoi isolé dans son propre `try/catch`** afin qu'un
échec n'interrompe ni la boucle ni le cycle de l'offre concernée.

### `src/modules/jobs/index.ts` (modifié)

Réexporte `runJobOffersLifecycle` — seul point d'entrée autorisé pour `src/app/`.

### `src/app/api/cron/route.ts` (modifié)

Ajoute `runJobOffersLifecycle(appUrl)` au `Promise.all` existant et sa clé au compte rendu
JSON, exactement comme les deux tâches du module intégration. **Aucune route cron dédiée** :
l'issue #465 évoquait `src/app/api/cron/job-offers-lifecycle/route.ts`, mais ce découpage a
été abandonné dans le projet — `integration-inactivity` a justement été supprimée au profit
de l'orchestrateur unique (cf. CHANGELOG v1.18.0).

### `src/lib/email.ts` (modifié)

`buildJobOfferRenewalEmail({ authorName, jobTitle, company, archiveDate, jobUrl })` →
`{ subject, html }`, sur le gabarit des templates existants.

Deux contraintes propres à ce module :

- **Aucun nom d'église** : le module emploi est transverse, l'email est donc signé
  « Koinonia » sans personnalisation d'église — contrairement à
  `buildMsdpInactivityEmail` qui reçoit un `churchName`.
- La spec impose que le message dise **ce qui se passera** et **à quelle date** :
  `archiveDate` est donc un paramètre obligatoire du template, pas un ornement.

## UI / composants

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` + migration | **Modifié** — `renewalRequestedAt` et son index |
| `src/modules/jobs/services/lifecycle-service.ts` | **Nouveau** — les deux passes |
| `src/modules/jobs/index.ts` | **Modifié** — réexport |
| `src/lib/email.ts` | **Modifié** — template de relance |
| `src/app/api/cron/route.ts` | **Modifié** — branchement de la tâche |
| `src/app/api/jobs/[id]/route.ts` | **Modifié** — `renew` + remise à zéro |
| `src/app/(auth)/jobs/[id]/page.tsx` | **Modifié** — expose `renewalRequestedAt` |
| `src/app/(auth)/jobs/[id]/JobDetailClient.tsx` | **Modifié** — bandeau + bouton |

### Page de détail d'une offre

Le composant possède déjà `isAuthor`, `canManage`, `isArchived` et une fonction
`toggleArchive` qui appelle le `PATCH` : le terrain est prêt.

Ajout, **visible uniquement quand une relance est en cours** (`renewalRequestedAt` non nul)
et pour qui peut agir (`isAuthor || canManage`) :

- un **bandeau d'alerte** — même emplacement que le bandeau « offre archivée » existant —
  annonçant que sans confirmation l'offre sera archivée, **avec la date** ;
- un bouton **« Toujours d'actualité »** qui envoie `PATCH { renew: true }` puis rafraîchit.

Afficher le bouton **en permanence** serait du bruit : une offre publiée il y a trois jours
n'a rien à confirmer. Il n'apparaît donc qu'au moment où il sert.

## Décisions & alternatives écartées

- **D1 — Réutiliser `updatedAt` comme date de référence, plutôt qu'ajouter un
  `lastRenewedAt`.**
  *Pourquoi* : la spec a tranché « modifier vaut confirmation ». `updatedAt` devient donc
  *par construction* la date de dernière manifestation de l'auteur — un second champ en
  serait une copie qu'il faudrait tenir synchronisée, avec le risque de divergence que cela
  suppose. Vérification faite : `updatedAt` **n'est affiché nulle part** dans l'UI des
  offres (seul `createdAt` l'est, dans la liste comme dans le détail), le fait que le
  traitement automatique le modifie n'a donc **aucun effet visible**.
  *Écarté* : un champ `lastRenewedAt` dédié. *Raison* : deux champs pour une seule
  information, et une migration à rétro-remplir sur les offres existantes.

- **D2 — Le champ `renewalRequestedAt` fait office de mémoire anti-doublon.**
  *Pourquoi* : la spec exige qu'une relance ne se répète pas à chaque passage. Un
  `renewalRequestedAt` non nul dit exactement « relance déjà envoyée, réponse attendue ».
  *Écarté* : relire l'historique des notifications pour déduire ce qui a déjà été envoyé —
  la méthode du précédent MSDP. *Raison* : c'est une déduction indirecte, coûteuse (une
  requête de plus) et fragile (elle casse si l'utilisateur supprime ses notifications). Ici
  l'état vit sur l'objet concerné, là où il a du sens.

- **D3 — Archiver avant de relancer, dans le même passage.**
  *Pourquoi* : dans l'ordre inverse, une offre arrivée à échéance d'archivage pourrait
  recevoir une relance juste avant d'être archivée — un email absurde. L'ordre garantit
  qu'on ne sollicite jamais un auteur pour une offre déjà condamnée.

- **D4 — Étendre le `PATCH` existant plutôt que créer une route de confirmation.**
  *Pourquoi* : sa garde (`auteur || Super Admin || Admin || Secrétaire`) est **exactement**
  la règle d'accès que la spec demande pour la confirmation. Une route dédiée dupliquerait
  cette garde, avec le risque classique que les deux copies divergent.
  *Écarté* : `POST /api/jobs/[id]/renew`. *Raison* : une route de plus, une garde de plus,
  pour un `UPDATE` d'une colonne.

- **D5 — Une seule ligne de remise à zéro, partagée par tous les chemins.**
  *Pourquoi* : mettre `renewalRequestedAt: null` sur **toute** requête `PATCH` acceptée
  couvre d'un coup la confirmation explicite, la modification ordinaire et la republication
  d'une offre archivée. Trois exigences de la spec, une ligne, aucun cas à oublier.

- **D6 — Brancher sur l'orchestrateur `POST /api/cron`, pas de route cron dédiée.**
  *Pourquoi* : c'est le pattern courant du projet. L'issue #465 proposait
  `src/app/api/cron/job-offers-lifecycle/route.ts` en s'appuyant sur
  `integration-inactivity/route.ts` — **cette route n'existe plus**, elle a été supprimée au
  profit de l'orchestrateur unique (CHANGELOG v1.18.0). Suivre l'issue à la lettre aurait
  recréé le découpage qu'on venait d'abandonner.

- **D7 — Pas de notification après archivage.**
  *Pourquoi* : la spec l'exclut explicitement. L'auteur a été prévenu 14 jours plus tôt, et
  l'offre reste republiable d'un clic.

## Risques & points d'attention

1. **Docker arrêté — la migration est bloquée.** `npm run db:migrate` exige la base locale.
   `docker-compose up -d` est un préalable strict à la première tâche ; sans lui, rien
   d'autre ne peut avancer puisque le client Prisma généré ne connaîtra pas le champ.

2. **« Aucune offre archivée le jour de la mise en service » mérite une lecture précise.**
   Le critère est satisfait pour toutes les offres **visibles** : leur `renewalRequestedAt`
   est `NULL`, aucune comparaison ne les attrape. En revanche les offres à **date limite
   dépassée** *seront* archivées dès le premier passage — c'est voulu par un autre critère
   de la même spec, et sans effet perceptible puisqu'elles avaient déjà disparu de la liste.
   Les deux critères ne se contredisent pas, mais la recette doit vérifier le bon : c'est
   une régularisation de stock, pas un archivage surprise.

3. **Salve de relances au premier passage.** Toutes les offres publiées depuis plus de 60
   jours sont relancées le même jour. C'est le comportement voulu par la spec, mais le
   volume est celui du stock accumulé depuis la création du module. À **mesurer avant la
   mise en production** (compter les offres publiées de plus de 60 jours) plutôt qu'à
   découvrir dans les logs d'envoi.

4. **`renew` ne doit jamais atteindre Prisma.** C'est un marqueur de requête, pas une
   colonne : oublier de l'extraire du payload validé produit une erreur Prisma à
   l'exécution — que le typecheck **ne verra pas**, `patchSchema` étant un objet Zod.
   À couvrir par un test.

5. **Le traitement doit rendre compte.** La spec l'exige (nombre de relances, nombre
   d'archivages). Sans ces compteurs remontés dans la réponse de l'orchestrateur, un
   dysfonctionnement resterait invisible — un traitement automatique muet est un
   traitement dont personne ne sait s'il tourne.

6. **Aucune isolation par église.** Le module est transverse : le traitement balaie **toutes**
   les offres de la plateforme en une passe, sans boucle par église contrairement aux autres
   tâches de l'orchestrateur. C'est correct ici, mais c'est une différence de forme avec le
   code voisin qui mérite d'être commentée pour ne pas passer pour un oubli.

## Stratégie de tests

### `src/modules/jobs/__tests__/lifecycle-service.test.ts` (nouveau)

Le cœur de la feature, et la seule partie réellement piégeuse. Avec `prismaMock` :

- une offre publiée depuis **moins** de 60 jours n'est **pas** relancée ;
- une offre publiée depuis **plus** de 60 jours est relancée : `renewalRequestedAt` posé,
  notification créée, email tenté ;
- une offre **déjà relancée** (`renewalRequestedAt` non nul) n'est **pas** relancée une
  seconde fois — la garantie anti-doublon ;
- une offre relancée depuis **plus** de 14 jours est archivée ; depuis **moins**, non ;
- une offre à **date limite dépassée** est archivée **sans** relance préalable ;
- une offre **déjà archivée** n'est ni relancée ni ré-archivée ;
- un **échec d'envoi d'email** n'interrompt pas le traitement des offres suivantes et
  n'empêche pas la pose de `renewalRequestedAt` ;
- un auteur **sans email** reçoit tout de même sa notification ;
- l'**ordre des passes** : une offre à la fois éligible à l'archivage et ancienne est
  archivée, pas relancée ;
- les **compteurs retournés** correspondent aux actions réellement effectuées.

### `src/app/api/jobs/__tests__/jobs.test.ts` (étendu)

Le fichier existe déjà :

- `PATCH { renew: true }` remet `renewalRequestedAt` à `null` ;
- une **modification ordinaire** (sans `renew`) le remet aussi à `null` ;
- **`renew` n'est pas transmis à Prisma** — verrouille le risque n°4 ;
- un utilisateur **ni auteur ni modérateur** reçoit **403** (comportement existant, à
  re-vérifier puisque la confirmation s'y adosse).

### `src/app/api/cron/__tests__/` (étendu)

- la tâche de cycle de vie est bien appelée par l'orchestrateur et sa clé figure dans le
  compte rendu.

### Non couvert automatiquement

Le rendu React (bandeau et bouton affichés seulement si `renewalRequestedAt` non nul et si
l'utilisateur peut agir) : `vitest` tourne en `environment: "node"` et n'inclut que
`*.test.ts`. Recette manuelle sur ces points, plus le contenu réel de l'email (date
d'archivage annoncée, lien vers l'offre).

### Portes de qualité

`npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.
`lint:boundaries` doit rester vert **sans modifier `.dependency-cruiser.cjs`** : le cron
n'atteint le service que par `@/modules/jobs`.

---

*Aucune question ouverte. Étape suivante : `/tasks`.*
