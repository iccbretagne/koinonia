# Plan technique — Notifications regroupées des changements de planning

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-03
- **Prérequis** : planificateur de tâches mutualisé (chantier `chore/planificateur-cron`,
  ADR-0021) — un seul déclencheur toutes les 5 minutes, chaque tâche à son propre rythme

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : la logique vit dans `src/modules/planning/services/` ; les routes
  l'importent via `@/modules/planning`
- [x] **Sécurité** : routes métier existantes inchangées côté garde ; aucune nouvelle route (la
  tâche passe par `/api/cron`, protégée par `CRON_SECRET`) ; réglage protégé par
  `requireChurchPermission("availability:settings", churchId)`
- [x] **Permissions** via `rolePermissions` — aucune permission nouvelle
- [x] **Validation** Zod : champ ajouté au schéma `PUT /api/availability/settings`
- [x] **Migration** Prisma : une table + une colonne (`prisma migrate dev`)
- [x] **Enums** `ServiceStatus` depuis `@/generated/prisma/client`
- [x] **UI** : un champ ajouté au formulaire existant, composants `Field`/`Input`

## Approche générale

On remplace l'envoi immédiat par une **file d'attente persistée** de changements, vidée par une
**tâche du planificateur** mutualisé (ADR-0021).

1. **Enregistrer** : chaque écriture du planning (grille, recopie, retrait d'un département)
   enregistre, pour chaque STAR touché, une ligne « en attente » par (STAR, événement,
   département). La ligne garde le **statut d'origine**, celui d'avant la première modification
   de la fenêtre, et la date de la **dernière modification**. Une ligne existante n'est jamais
   réécrite pour son statut d'origine : seule la date de dernière modification avance.
2. **Vider** : une tâche `planning-change-notices` déclarée au planificateur avec le rythme
   « à chaque passage » (5 minutes) sélectionne les STAR dont la
   dernière modification est plus ancienne que le délai de leur église. Pour chacun, elle compare
   statut d'origine et statut actuel (**changement net**), envoie **une** notification
   récapitulative (in-app + email selon préférences), puis supprime ses lignes.

Le délai est une colonne de `AvailabilitySettings` (réglage par église existant de la spec 058).

## Modèle de données

```prisma
/// Changement de planning en attente de notification regroupée (spec 060).
/// Une ligne par STAR × événement × département, vidée à l'envoi.
model PlanningChangeNotice {
  id             String         @id @default(cuid())
  churchId       String
  memberId       String
  eventId        String
  departmentId   String
  /// Statut avant la première modification de la fenêtre ; null = absent du planning.
  previousStatus ServiceStatus?
  lastChangedAt  DateTime
  createdAt      DateTime       @default(now())

  @@unique([memberId, eventId, departmentId])
  @@index([churchId, lastChangedAt])
  @@map("planning_change_notices")
}

model AvailabilitySettings {
  // …
  planningNoticeDelayMinutes Int @default(15)
}
```

- **Pas de relation** vers `Event`/`Department`/`Member`/`EventDepartment` : la ligne doit
  survivre au retrait d'un département (l'`EventDepartment` est supprimé) et ne pas bloquer les
  suppressions de structure (membre, département, ministère, église). Une ligne orpheline est
  écartée au vidage.
- La clé repose sur (événement, département) et non sur l'`EventDepartment`, qui disparaît au
  retrait du département.
- Défaut de colonne à 15 : les églises sans ligne `AvailabilitySettings` utilisent la même
  valeur par défaut que `getAvailabilitySettings`.
- Migration : `add_planning_change_notices`.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/availability/settings` | GET/PUT | `availability:settings` | + `planningNoticeDelayMinutes: z.number().int().min(5).max(120)` | réglages |
| `/api/events/[eventId]/departments/[deptId]/planning` | PUT | inchangée | inchangée | inchangée ; **ne notifie plus** directement |
| `/api/events/[eventId]/duplicate-planning` | POST | inchangée | inchangée | inchangée ; enregistre les changements |
| `/api/events/[eventId]/departments` | DELETE | inchangée | inchangée | inchangée ; enregistre les retraits |

Aucune nouvelle route : la tâche est déclarée dans le planificateur de `POST /api/cron`. Si un
serveur garde encore l'ancien minuteur horaire, les notifications partent quand même, avec au
plus une heure de retard.

## Services / logique métier

Nouveau fichier `src/modules/planning/services/planning-change-notices.ts`, exporté par l'index.

- `type PlanningChange = { memberId; eventId; departmentId; previousStatus: ServiceStatus | null }`
- **`recordPlanningChanges(db, churchId, changes, { actorId, now })`**
  - `db` : client Prisma ou `tx`, pour écrire dans la transaction de l'appelant quand il y en a
    une.
  - Écarte les changements dont le STAR est relié au compte de l'auteur (`MemberUserLink` validé
    de l'`actorId`) : l'auteur n'est pas prévenu de ses propres modifications.
  - Écarte les événements passés (`event.date < now`).
  - Pour chaque changement restant : `upsert` sur `(memberId, eventId, departmentId)`, avec
    `create: { previousStatus, lastChangedAt: now }` et `update: { lastChangedAt: now }`. Le
    statut d'origine n'est jamais écrasé.
  - Puis aligne la date de dernière modification de **toutes** les lignes du STAR :
    `updateMany({ memberId }, { lastChangedAt: now })`. Le délai court par STAR, pas par service.
- **`computeNetChanges(rows, current)`** (pure)
  - Normalise les statuts : `null` et `INDISPONIBLE` (hérité, ADR-0020) valent « absent ».
  - Renvoie, pour chaque ligne, `ADDED(status)`, `REMOVED` ou `CHANGED(from, to)`. Une ligne qui
    retrouve son statut d'origine disparaît.
- **`buildPlanningDigest(memberChanges)`** (pure)
  - Trie par date d'événement.
  - Titre : « Planning mis à jour ».
  - Message court en une phrase (« Tu sers le 2, le 16 et le 23 novembre ; tu ne sers plus le
    9 »), avec les lignes détaillées.
  - Lien : `/planning` (« Mon planning »).
- **`flushPlanningChangeNotices(now)`**
  1. Charge les délais par église, puis les STAR dont `max(lastChangedAt) + délai ≤ now`.
  2. Pour chaque STAR, dans une transaction :
     - relit ses lignes ;
     - les supprime avec `deleteMany({ id in …, lastChangedAt ≤ snapshot })` ;
     - si le nombre supprimé est inférieur au nombre lu, abandonne ce STAR : une modification
       vient d'arriver ou un autre vidage tourne en parallèle, il sera repris au passage suivant.
  3. Hors transaction : lit les statuts actuels, l'événement et le département. Écarte :
     - un événement disparu ou passé (la suppression est déjà notifiée par la spec 059) ;
     - un département disparu ;
     - un STAR sans compte relié.
  4. Calcule le changement net et envoie avec `createNotification(...)` :
     - `domain: "planning"`, `type: "PLANNING_DIGEST"` ;
     - email via un nouveau gabarit `buildPlanningChangesEmail` (`@/lib/email`), parce que le
       gabarit générique ne rend pas une liste ;
     - les erreurs sont avalées et journalisées.
  5. Renvoie `{ notified, members }`.
- `getAvailabilitySettings`/`updateAvailabilitySettings` : ajout du champ.

### Points d'enregistrement

| Écriture | Où | Statut d'origine |
|---|---|---|
| Grille | route `PUT …/planning` | `prevStatusMap` déjà lu. Le bloc de notifications immédiates (`notifyUsers` par statut) est **supprimé** et remplacé par `recordPlanningChanges` pour les statuts qui changent |
| Recopie | route `duplicate-planning` | lecture des plannings cibles existants dans la transaction, avant les `upsert` |
| Retrait d'un département (un événement ou série) | route `DELETE …/departments` | lecture des plannings de l'`EventDepartment` avant le `deleteMany` |
| Retrait via demande approuvée | `request-executor` (`toRemove`) | idem, dans la transaction de l'exécuteur |

Non concernés, conformément au hors périmètre de la spec :
- suppressions de membre, département, ministère ou église ;
- fusion de fiches ;
- suppression ou déplacement d'événement (spec 059).

## UI / composants

- `src/app/(auth)/disponibilites/parametres/AvailabilitySettingsClient.tsx` : nouveau champ
  numérique « Délai avant l'envoi des changements de planning (minutes) », de 5 à 120.
  - Il reste **éditable même si la collecte est désactivée** : le délai ne dépend pas du réglage
    `enabled`.
  - Placé dans une section à part du formulaire, avec un texte d'aide : « Les STAR reçoivent un
    seul récapitulatif une fois que leur planning n'a plus changé pendant ce délai. »
- Grille : aucun changement visible. Le toast d'enregistrement reste inchangé.
- Mobile : une seule colonne, un champ pleine largeur (pas de nouvelle mise en page).

## Décisions & alternatives écartées

- **Choix : file persistée en base, vidée par une tâche planifiée.** *Pourquoi :* résiste aux
  redémarrages et aux déploiements, fonctionne avec plusieurs process, et reste observable (les
  lignes en attente).
- **Choix : une tâche du planificateur mutualisé** (ADR-0021), au rythme « à chaque passage ».
  *Pourquoi :* un seul déclencheur toutes les 5 minutes pour toute l'application ; les autres
  tâches gardent leur rythme (le récapitulatif secrétariat reste horaire). Précision : au plus
  5 minutes de retard, conforme au critère « quelques minutes ».
- **Écarté : une route cron dédiée avec un second minuteur systemd.** *Raison :* une
  installation de plus par serveur, et rien de mutualisé pour les tâches suivantes.
- **Écarté : minuterie en mémoire du serveur Next** (`setTimeout` à chaque modification).
  *Raison :* perdue au redémarrage, dupliquée s'il y a plusieurs process, et contraire au modèle
  sans état des route handlers.
- **Écarté : vidage dans le worker audio**, qui tourne déjà en boucle. *Raison :* ce process
  appartient au module audio (frontières), et une église peut ne pas l'exécuter.
- **Écarté : déduire les changements du journal d'audit.** *Raison :* l'audit grille ne trace
  qu'un compte par département, sans le statut avant et après de chaque STAR.
- **Choix : délai par STAR**, l'envoi attendant que **toutes** ses lignes soient calmes.
  *Pourquoi :* la spec dit « aucune modification concernant le STAR » ; un STAR touché par deux
  responsables reçoit un seul message.
- **Choix : l'auteur est écarté à l'enregistrement.** *Conséquence acceptée :* si un autre
  responsable a déjà touché la même ligne dans la fenêtre, le changement net inclut aussi la
  modification de l'auteur. Ce cas est rare, et le message reste exact sur l'état final.

## Risques & points d'attention

- **Minuteur resté horaire** sur un serveur : les envois partent quand même, avec au plus une
  heure de retard. Le passage du minuteur à 5 minutes relève du chantier planificateur.
- **Course entre vidage et nouvelle modification** : gérée par la suppression conditionnelle
  (`lastChangedAt ≤ snapshot`) et l'abandon du STAR si le nombre supprimé ne correspond pas.
- **Volume** : une recopie ou un retrait de département sur une série peut créer des centaines de
  lignes. Les `upsert` restent dans la transaction existante ; à surveiller sans optimiser
  d'avance.
- **Changement de délai** : il s'applique aux lignes en attente, puisque le délai est lu au
  vidage. C'est conforme à la spec.
- **Disparition des notifications immédiates** : les tests existants de la route grille qui
  vérifient `notifyUsers` sont à adapter.

## Stratégie de tests

- **`planning-change-notices.test.ts`** (service, `prismaMock`) :
  - `computeNetChanges` : ajouté, retiré, statut changé, aller-retour annulé, `INDISPONIBLE`
    traité comme absent ;
  - `buildPlanningDigest` : tri par date, message, lien `/planning` ;
  - `recordPlanningChanges` : statut d'origine conservé au second `upsert`, auteur écarté,
    événement passé écarté, `lastChangedAt` aligné sur toutes les lignes du STAR ;
  - `flushPlanningChangeNotices` :
    - délai non écoulé, donc pas d'envoi ;
    - délai écoulé, donc une notification pour plusieurs départements ;
    - changement net vide, donc rien n'est envoyé mais les lignes sont supprimées ;
    - événement supprimé ou passé écarté ;
    - STAR sans compte ;
    - nombre supprimé différent, donc STAR abandonné ;
    - délai propre à chaque église ;
    - échec d'envoi avalé.
- **Routes** :
  - grille : plus d'appel à `notifyUsers`, et `recordPlanningChanges` appelé avec les bons statuts
    d'origine ;
  - recopie et retrait de département : enregistrement ;
  - planificateur : la tâche `planning-change-notices` est déclarée au rythme « à chaque passage » ;
  - `PUT /api/availability/settings` : bornes 5 et 120.
- **Exécuteur de demandes** : un retrait de département enregistre les changements.
