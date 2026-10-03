# Plan technique — Prévenir les personnes planifiées d'un changement ou d'une suppression d'événement

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-03

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/planning` (index). Tout le code nouveau vit dans le module planning.
- [x] **Sécurité** : aucune route nouvelle. Les routes modifiées gardent leur garde actuelle (`events:manage` dans l'église de l'événement, ou l'approbation de demande). Les destinataires sont filtrés sur le `churchId` de l'événement.
- [x] **Permissions** : aucune permission nouvelle, aucune modification de `rolePermissions`.
- [x] **Validation** Zod : schémas des routes inchangés (aucun nouveau champ d'entrée).
- [x] **Migration** Prisma : aucune, le schéma ne change pas.
- [x] **Enums** : `ServiceStatus` et `Role` importés depuis `@/generated/prisma/client`.
- [x] **UI** : `useToast` (`src/components/ui/Toast.tsx`, provider déjà dans le layout racine).

## Approche générale

Le changement d'un événement se fait toujours **dans une transaction**, et une suppression efface
les plannings (`deleteEvents`). Les destinataires doivent donc être lus **dans la transaction**,
avant la suppression ou juste après la mise à jour. L'envoi (application + email) se fait **après
le commit**, comme l'exige le helper de notifications : avec `tx`, aucun email ne part.

Le travail se fait en deux temps, dans un nouveau service `src/modules/planning/services/event-change-notices.ts` :

1. `collectEventChangeNotices(tx, churchId, changes, { actorId, now })` : dans la transaction,
   charge l'audience des événements concernés et **construit** les notifications, une par
   destinataire. N’écrit rien. Retourne un objet `EventChangeNotices` (liste de notifications
   prêtes à envoyer).
2. `sendEventChangeNotices(notices)` : après le commit, envoie chaque notification avec
   `createNotification` (domaine `planning`, email générique selon la préférence, sans
   `tx`). Retourne `{ notified: number }`.

Chaque point d'entrée qui déplace ou supprime un événement appelle (1) dans sa transaction et
(2) après. Il y en a cinq ; c'est explicite plutôt que caché dans un abonné du bus (voir
décisions).

## Modèle de données

Aucun changement.

Lectures utilisées par la collecte (toutes bornées à `churchId`) :

- `Planning` (statut `EN_SERVICE`, `EN_SERVICE_DEBRIEF`, `REMPLACANT`) → `EventDepartment`
  (`eventId`, `departmentId`) → `Member.userLinks` (`MemberUserLink.userId`).
- Responsables : `UserDepartment` (`departmentId ∈ départements concernés`, principal et
  adjoints) dont `userChurchRole.churchId = churchId` et `role = DEPARTMENT_HEAD`.
- Ministres : `UserChurchRole` (`churchId`, `role = MINISTER`, `ministryId ∈ ministères des
  départements concernés`), avec `Department.ministryId`.
- Événement : `title`, `date` (ancienne date pour un déplacement, date de l'événement supprimé).

## API

Aucun endpoint nouveau. Réponses enrichies d'un champ `notified` (nombre de personnes prévenues) :

| Endpoint | Méthode | Changement |
|---|---|---|
| `/api/events/[eventId]` | PUT | collecte si la date change (événement seul ou série), `notified` dans la réponse |
| `/api/events/[eventId]` | DELETE | collecte avant `deleteEvents`, `{ success, notified }` |
| `/api/events` | PATCH `action: "update"` avec `date` | collecte pour chaque événement déplacé, `notified` |
| `/api/events` | PATCH `action: "delete"` | collecte avant suppression, `{ deleted, notified }` |
| `/api/requests/[id]` | PATCH (approbation `MODIFICATION_EVENEMENT` / `ANNULATION_EVENEMENT`) | `executeRequest` renvoie les notifications à envoyer ; envoi après commit, `notified` dans la réponse |

Les routes restent sous le seuil `lint:prisma-boundary` : aucune lecture Prisma ajoutée dans un
route handler, tout passe par le service.

## Services / logique métier

### `event-change-notices.ts` (nouveau, exporté par `@/modules/planning`)

```ts
export type EventChange =
  | { kind: "MOVED"; eventId: string; previousDate: Date; newDate: Date }
  | { kind: "CANCELLED"; eventId: string };

export interface EventChangeNotices { items: PendingNotice[] }   // PendingNotice = { userId, title, message, link }

export function emptyEventChangeNotices(): EventChangeNotices;
export async function collectEventChangeNotices(tx, churchId, changes: EventChange[], opts: { actorId: string; now?: Date }): Promise<EventChangeNotices>;
export async function sendEventChangeNotices(n: EventChangeNotices): Promise<{ notified: number }>;
export function mergeEventChangeNotices(a, b): EventChangeNotices;  // pour un appelant qui collecte en plusieurs fois
```

Règles appliquées par `collectEventChangeNotices` :

- **Filtre** : `MOVED` où `previousDate === newDate` est ignoré. Un événement dont la date
  d'origine est passée (`previousDate`, ou la date de l'événement supprimé, `< now`) est ignoré.
- **Audience par événement** : STAR planifiés liés (statuts listés ci-dessus), départements
  ayant ≥ 1 planifié (avec ou sans compte), leurs responsables et les Ministres des ministères de
  ces départements. Un STAR planifié sans compte compte dans le récapitulatif, mais ne reçoit rien.
- **Regroupement par destinataire** sur tous les événements du lot (série, suppression groupée).
  Un utilisateur qui est encadrant (responsable et/ou Ministre) reçoit **uniquement** la
  notification d'encadrant. Celle-ci mentionne sa propre affectation s'il est lui-même planifié.
- **Exclusion de l'auteur** (`actorId`).
- **Contenu**, construit par des fonctions pures testables :
  - STAR, un événement déplacé : titre « Changement d'horaire : {titre} », message
    « {titre} du {jour date} : {ancienne heure/date} → {nouvelle}. Vous êtes toujours
    planifié. Si vous ne pouvez plus servir, prévenez votre responsable. », lien `/planning`.
  - STAR, un événement annulé : titre « Événement annulé : {titre} », message
    « {titre} du {jour date à heure} est annulé. Votre service est retiré de votre planning. »,
    lien `/planning`.
  - Encadrant : titre identique, message suivi de « Personnes concernées : Louange (3),
    Accueil (2). », lien `/dashboard`.
  - Plusieurs événements : titre « {n} événements modifiés » ou « {n} événements annulés », et
    une ligne par événement dans le message.
  - Le type de notification est `EVENT_RESCHEDULED`, `EVENT_CANCELLED` ou `EVENT_CHANGES` (lot
    mixte, sans doute jamais émis en pratique).
- **Dates** : formatage `fr-FR` (`weekday long`, `day`, `month long`, `hour/minute 2-digit`),
  identique aux autres messages de planning (`src/lib/email.ts`).

`sendEventChangeNotices` envoie avec `createNotification(item)`, domaine `planning`, sans contenu
email ; c'est donc l'email générique, selon la préférence « Planning et service ». Une erreur
d'envoi est journalisée et avalée : elle ne doit jamais faire échouer la modification déjà
validée.

### Points d'entrée modifiés

- **`deleteEvents(ctx, ids)`** (`event.service.ts`) : appelle `collectEventChangeNotices`
  (`CANCELLED`) **avant** la purge des plannings et **retourne** `EventChangeNotices`. Ses trois
  appelants (DELETE unitaire, PATCH suppression groupée, exécution d'une demande d'annulation)
  récupèrent ainsi les notifications sans nouvelle lecture. `ctx.userId` sert d'`actorId`.
- **PUT `/api/events/[eventId]`** : branche série (collecte des `MOVED` dans la boucle, en un
  seul appel après la boucle) et branche événement seul.
- **PATCH `/api/events` (update)** : collecte pour `before` lorsque `data.date` est fourni.
- **`executeRequest`** : `ExecutionResult` gagne `notices?: EventChangeNotices`, rempli par
  `executeModificationEvenement` (`MOVED` si la date change) et `executeAnnulationEvenement`
  (retour de `deleteEvents`). La route `/api/requests/[id]` sort `notices` de la transaction et
  appelle `sendEventChangeNotices` après le commit.

Le bus (`planning:event:rescheduled`, `planning:event:cancelled`) n'est **pas modifié**, et
l'abonné disponibilités (spec 058) continue de tourner tel quel.

## UI / composants

- `src/app/(auth)/admin/events/EventsClient.tsx` : après une modification de date, une
  suppression (unitaire ou groupée) ou une modification groupée réussie, si `notified > 0`,
  un `toast.success` dit « {n} personne(s) prévenue(s) ». Les `alert()` existants ne changent pas.
- L'écran d'approbation des demandes (secrétariat) : même toast si la réponse porte `notified > 0`.
- Aucun nouveau composant.

## Décisions & alternatives écartées

- **Choix** : collecte explicite dans la transaction et envoi explicite après le commit, avec
  retour de valeur (`deleteEvents` et `executeRequest` renvoient les notifications). *Pourquoi* :
  - les plannings sont supprimés dans la même transaction, donc l'audience doit être lue avant ;
  - les emails ne partent jamais avec `tx` ;
  - le compteur affiché à l'auteur exige un retour synchrone.
- **Écarté** : un abonné du bus qui accumule les notifications dans une `WeakMap` indexée par
  `tx`. *Raison* : couplage caché (l'appelant doit quand même « vider » la file après commit, sans
  que le type l'y oblige), et `EventBus` n'offre pas de hook après commit. Ajouter un hook
  `afterCommit` au cœur serait une décision d'architecture (ADR) disproportionnée pour une feature.
- **Écarté** : une file en base traitée par le cron horaire (comme les demandes de disponibilité
  de la spec 058). *Raison* : la spec demande un envoi immédiat et un compteur pour l'auteur ;
  une migration et une table de plus ne servent à rien ici.
- **Écarté** : un nouveau domaine de notification. *Raison* : décision de revue (domaine
  `planning`, déjà « changements de planning »).
- **Choix** : lien `/planning` pour un STAR (il n'a pas accès à `/dashboard`), `/dashboard` pour
  un encadrant.
- **Pas d'ADR** : décision propre à la feature, sans changement d'infrastructure ni de
  frontière entre modules.

## Risques & points d'attention

- **Cinq points d'entrée** : en oublier un fait silencieusement taire la notification. Chacun a
  son test de route (voir ci-dessous).
- **Volume** : une suppression groupée de nombreux événements produit une seule notification par
  destinataire, mais les lectures se font en une seule requête par table (`in: eventIds`), pas
  par événement.
- **Durée de transaction** : la collecte ajoute trois ou quatre lectures dans la transaction.
  C'est acceptable (déjà le cas pour les disponibilités).
- **Erreurs d'envoi** après commit : avalées et journalisées. La modification reste valide.
- **Doublon avec la spec 058** : pendant une collecte de disponibilités, un STAR peut recevoir
  aussi la nouvelle question « Êtes-vous disponible ? ». C'est voulu (spec, cas limites).
- **Fuseau horaire** : même formatage que les autres messages serveur. Pas d'aggravation de
  l'existant.

## Stratégie de tests

- `src/modules/planning/services/__tests__/event-change-notices.test.ts` (prismaMock) :
  - un STAR planifié par statut (EN_SERVICE, EN_SERVICE_DEBRIEF, REMPLACANT) est notifié ;
    INDISPONIBLE et `null` ne le sont pas ;
  - le responsable (principal et adjoint) et le Ministre du ministère sont notifiés, avec le
    récapitulatif ;
  - un encadrant planifié ne reçoit qu'une seule notification ;
  - l'auteur est exclu ;
  - un STAR sans compte apparaît dans le compteur de l'encadrant, mais ne reçoit rien ;
  - un événement passé, un `MOVED` sans changement de date ou un événement sans planifié ne
    produit rien ;
  - une série (plusieurs `MOVED`) donne une notification par destinataire, une ligne par
    événement ;
  - la requête filtre bien `churchId` ;
  - `sendEventChangeNotices` appelle `createNotification` (domaine `planning`, sans `tx`) et avale
    une erreur.
- `event.service` : `deleteEvents` collecte avant `planning.deleteMany` (ordre des appels) et
  retourne les notifications.
- Routes (`src/app/api/events/__tests__`, `src/app/api/events/[eventId]/__tests__`,
  `src/app/api/requests/...`) : chaque point d'entrée appelle l'envoi après la transaction et
  renvoie `notified`. Un changement de titre seul (PUT sans changement de date, PATCH sans
  `date`) n'envoie rien.
- `request-executor` : `ExecutionResult.notices` est rempli pour une modification de date et
  pour une annulation, et vide pour une modification de titre.
