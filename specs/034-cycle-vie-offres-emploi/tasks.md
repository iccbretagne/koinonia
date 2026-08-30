# Tâches — Cycle de vie des offres d'emploi

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : En cours (code + tests livrés ; T12 mesure pré-prod et T13 recette manuelle en attente)

> Tâches **ordonnées** et **vérifiables**. Les tâches `[P]` sont parallélisables
> (fichiers réellement indépendants).
>
> ⚠️ Contrairement aux specs 032 et 033, celle-ci **modifie le schéma** : la migration est
> bloquante, tout le reste en dépend (le client Prisma généré doit connaître le nouveau
> champ avant que quoi que ce soit compile).

## Prérequis

- [x] **Docker démarré** : `docker-compose up -d` — sans la base locale, `npm run db:migrate`
      échoue et **aucune** tâche ne peut avancer (cf. `plan.md` risque n°1)
- [x] Branche créée : `feat/cycle-vie-offres-emploi` (depuis `main` à jour)
- [x] Vérifier que `prisma/migrations/20260614095330_init_macbook_dev_env/` (non suivi,
      artefact local) **n'est pas** ajouté au commit

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter à `JobOffer` le champ `renewalRequestedAt DateTime?` (nullable, sans
      valeur par défaut : `NULL` **est** l'état « aucune relance en cours », rien à
      rétro-remplir) et l'index `@@index([status, renewalRequestedAt])` qui sert les deux
      requêtes du traitement. Générer la migration avec **`npm run db:migrate`**
      (`job_offer_renewal_tracking`) — **jamais `db push`** (constitution §III).
      *(fichiers : `prisma/schema.prisma`, `prisma/migrations/…`)*

### 2. Logique métier (module jobs)

- [x] **T2** `[P]` — Ajouter le template d'email de relance
      `buildJobOfferRenewalEmail({ authorName, jobTitle, company, archiveDate, jobUrl })`
      → `{ subject, html }`, sur le gabarit des templates existants du fichier. Deux
      contraintes propres à ce module : **aucun nom d'église** (le module emploi est
      transverse, l'email est signé « Koinonia »), et `archiveDate` est un paramètre
      **obligatoire** — la spec exige que le message dise ce qui se passera **et à quelle
      date**.
      *(fichier : `src/lib/email.ts`)* *(dépend de T1 pour rien, mais T3 en dépend)*

- [x] **T3** — Créer le service de cycle de vie. Le module `jobs` ne contient aujourd'hui
      que son manifeste : **le dossier `services/` est à créer**, ce qui l'aligne sur
      `integration` et `rooms`.
      Constantes : `RENEWAL_AFTER_DAYS = 60`, `ARCHIVE_AFTER_RENEWAL_DAYS = 14`,
      `RENEWAL_NOTIF_TYPE = "JOB_OFFER_RENEWAL"`.
      `runJobOffersLifecycle(appUrl)` → `{ archived, renewalsSent, emailFailures }`, en
      **deux passes, archivage d'abord** (on ne relance jamais une offre qu'on s'apprête à
      archiver dans le même passage) :
      1. **archivage** — `status = PUBLISHED` ET (`renewalRequestedAt < now − 14 j` OU
         `deadline < now`) → `ARCHIVED`. Un `updateMany` suffit : ni email, ni notification
         (la spec exclut explicitement un message « votre offre a été archivée ») ;
      2. **relance** — `status = PUBLISHED` ET `renewalRequestedAt IS NULL` ET
         `updatedAt < now − 60 j` ET (`deadline IS NULL` OU `deadline ≥ now`) → poser
         `renewalRequestedAt`, créer la notification (**toujours**), tenter l'email (si
         `SMTP_HOST` et adresse auteur), **chaque envoi isolé dans son propre `try/catch`**
         pour qu'un échec n'interrompe ni la boucle ni le cycle de l'offre.
      Commenter l'absence de boucle par église : le module est **transverse**, le traitement
      balaie toutes les offres en une passe — différence de forme assumée avec les tâches
      voisines de l'orchestrateur, à ne pas prendre pour un oubli (cf. `plan.md` risque n°6).
      *(fichier : `src/modules/jobs/services/lifecycle-service.ts`)* *(dépend de T1, T2)*

- [x] **T4** — Réexporter `runJobOffersLifecycle` depuis l'index du module — **seul** point
      d'entrée autorisé pour `src/app/` (constitution §I).
      *(fichier : `src/modules/jobs/index.ts`)* *(dépend de T3)*

### 3. API (route handlers)

- [x] **T5** — Brancher la tâche dans l'orchestrateur cron : ajouter
      `runJobOffersLifecycle(appUrl)` au `Promise.all` existant et sa clé
      `jobOffersLifecycle` au compte rendu JSON, comme les deux tâches du module
      intégration. **Aucune route cron dédiée** : le découpage proposé par l'issue #465
      (`cron/job-offers-lifecycle/route.ts`) a été abandonné dans le projet — la route
      `integration-inactivity` a justement été supprimée au profit de l'orchestrateur
      unique (CHANGELOG v1.18.0).
      *(fichier : `src/app/api/cron/route.ts`)* *(dépend de T4)*

- [x] **T6** `[P]` — Étendre `PATCH /api/jobs/[id]` : ajouter
      `renew: z.literal(true).optional()` au `patchSchema`, puis dans le handler —
      - **retirer `renew` du payload avant le `update` Prisma** : c'est un marqueur de
        requête, pas une colonne ; l'oublier produit une erreur Prisma à l'exécution que le
        typecheck **ne verra pas** (cf. `plan.md` risque n°4) ;
      - mettre `renewalRequestedAt: null` sur **toute** requête acceptée, que `renew` soit
        présent ou non — une seule ligne qui couvre la confirmation explicite, la
        modification ordinaire **et** la republication d'une offre archivée.
      La garde existante (auteur **ou** Super Admin / Admin / Secrétaire) est **réutilisée
      telle quelle** : elle correspond déjà exactement à la règle d'accès de la spec.
      *(fichier : `src/app/api/jobs/[id]/route.ts`)* *(dépend de T1)*

### 4. UI

- [x] **T7** `[P]` — Exposer `renewalRequestedAt` dans les données passées au composant de
      détail.
      *(fichier : `src/app/(auth)/jobs/[id]/page.tsx`)* *(dépend de T1)*

- [x] **T8** — Ajouter, **uniquement quand une relance est en cours**
      (`renewalRequestedAt` non nul) **et** pour qui peut agir (`isAuthor || canManage`) :
      - un **bandeau d'alerte** au même emplacement que le bandeau « offre archivée »
        existant, annonçant que sans confirmation l'offre sera archivée, **avec la date** ;
      - un bouton **« Toujours d'actualité »** qui envoie `PATCH { renew: true }` puis
        rafraîchit.
      Ne **pas** afficher le bouton en permanence : une offre publiée il y a trois jours n'a
      rien à confirmer, ce serait du bruit.
      *(fichier : `src/app/(auth)/jobs/[id]/JobDetailClient.tsx`)* *(dépend de T6, T7)*

### 5. Tests

- [x] **T9** — Tests du service — le cœur de la feature et sa seule partie réellement
      piégeuse (avec `prismaMock`) :
      - offre publiée depuis **moins** de 60 j → **pas** relancée ;
      - offre publiée depuis **plus** de 60 j → relancée : `renewalRequestedAt` posé,
        notification créée, email tenté ;
      - offre **déjà relancée** (`renewalRequestedAt` non nul) → **pas** de seconde
        relance : la garantie anti-doublon ;
      - offre relancée depuis **plus** de 14 j → archivée ; depuis **moins** → non ;
      - offre à **date limite dépassée** → archivée **sans** relance préalable ;
      - offre **déjà archivée** → ni relancée ni ré-archivée ;
      - **échec d'envoi d'email** → n'interrompt pas les offres suivantes et n'empêche pas
        la pose de `renewalRequestedAt` ;
      - auteur **sans email** → notification créée quand même ;
      - **ordre des passes** : une offre à la fois éligible à l'archivage et ancienne est
        archivée, **pas** relancée ;
      - les **compteurs retournés** correspondent aux actions réellement effectuées.
      *(fichier : `src/modules/jobs/__tests__/lifecycle-service.test.ts`)* *(dépend de T3)*

- [x] **T10** `[P]` — Étendre les tests de la route offres (le fichier existe déjà) :
      - `PATCH { renew: true }` remet `renewalRequestedAt` à `null` ;
      - une **modification ordinaire** (sans `renew`) le remet **aussi** à `null` ;
      - **`renew` n'est pas transmis à Prisma** — verrouille le risque n°4 ;
      - un utilisateur **ni auteur ni modérateur** reçoit **403** (comportement existant, à
        re-vérifier puisque la confirmation s'y adosse désormais).
      *(fichier : `src/app/api/jobs/__tests__/jobs.test.ts`)* *(dépend de T6)*

- [x] **T11** `[P]` — Vérifier que l'orchestrateur appelle bien la tâche de cycle de vie et
      que sa clé figure dans le compte rendu — sans quoi un traitement muet resterait
      invisible.
      *(fichier : `src/app/api/cron/__tests__/`)* *(dépend de T5)*

### 6. Mise en service & recette

- [ ] **T12** — **Avant la mise en production**, compter les offres publiées depuis plus de
      60 jours : c'est le volume exact de la salve de relances du premier passage. À
      mesurer, pas à découvrir dans les logs d'envoi (cf. `plan.md` risque n°3).

- [ ] **T13** — Recette manuelle (le rendu React n'est pas testable automatiquement :
      `vitest` tourne en `environment: "node"` et n'inclut que `*.test.ts`) :
      - bandeau et bouton **absents** sur une offre sans relance en cours ;
      - bandeau et bouton **présents** sur une offre relancée, pour l'auteur **et** pour un
        modérateur, **absents** pour un autre utilisateur ;
      - clic sur « Toujours d'actualité » → bandeau disparu, offre toujours visible ;
      - **contenu réel de l'email** : date d'archivage annoncée et lien vers l'offre ;
      - une offre **modifiée** sans clic sur le bouton n'est plus sur la trajectoire
        d'archivage ;
      - **vérification du critère de mise en service** : au premier passage, les offres
        anciennes **visibles** sont relancées et **aucune** n'est archivée ; les offres à
        **date limite dépassée** *sont* archivées — c'est une régularisation de stock voulue
        par la spec, pas un archivage surprise (cf. `plan.md` risque n°2).

## Couverture des critères d'acceptation

| Critère de `spec.md` | Tâche(s) |
|---|---|
| Offre publiée ≥ 60 j sans confirmation → relance | T3, T9 |
| Relance par email **et** notification in-app | T2, T3, T9 |
| Message indiquant ce qui se passera **et** la date | T2, T13 |
| Offre relancée ≥ 14 j → archivage automatique | T3, T9 |
| Statut identique à un archivage volontaire | T3 *(aucun enum nouveau)* |
| Action « Toujours d'actualité » sur la page de l'offre | T8 |
| L'action repousse de 60 j et efface la relance en cours | T6, T10 |
| Action proposée à l'auteur et aux modérateurs seulement | T6, T8, T13 |
| Confirmation refusée à un non-autorisé, même hors interface | T6, T10 |
| Offre déjà archivée : ni relancée ni ré-archivée | T3, T9 |
| Deux exécutions successives → une seule relance | T3, T9 |
| Offre republiée : cycle complet, pas de relance immédiate | T6, T10 |
| Date limite dépassée → archivage sans relance | T3, T9, T13 |
| Échec d'email → traitement des autres offres poursuivi | T3, T9 |
| Auteur sans email → notification créée, cycle normal | T3, T9 |
| Traitement automatique sans intervention humaine | T5, T11 |
| Le traitement rend compte de ce qu'il a fait | T3, T5, T11 |
| Mise en service : anciennes relancées, aucune archivée | T1 *(`NULL`)*, T3, T9, T12, T13 |
| Modifier une offre vaut confirmation | T6, T10 |

Les 19 critères de la spec sont couverts par au moins une tâche.

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries` — doit passer **sans modifier `.dependency-cruiser.cjs`** :
      preuve que le cron n'atteint le service que par `@/modules/jobs`
- [x] `npm run test`
- [x] La **migration est committée** avec le code qui en dépend (schéma et migration dans le
      même commit)
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits (cf. tableau + T13)
- [ ] `git status` propre hors fichiers voulus — la migration locale
      `20260614095330_init_macbook_dev_env/` **reste non suivie**
- [ ] PR ouverte vers `main`, référençant l'issue #465 et la spec
      `specs/034-cycle-vie-offres-emploi/`
