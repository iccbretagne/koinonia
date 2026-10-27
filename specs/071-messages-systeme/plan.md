# Plan technique — Messages système (annonces internes)

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-27

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `messages` (`src/modules/messages/`). `src/app/`
  passe par `@/modules/messages`, `@/modules/messages/auth` et `@/modules/messages/schemas`. Le
  layout `(auth)` l'importe dynamiquement, sous `registry.has("messages")`.
- [x] **Sécurité** :
  - publication sous `requireChurchPermission("messages:publish", churchId)` ;
  - un message d'instance (`churchId` nul) exige en plus le Super Admin, via
    `requireMessageAuthorAccess`, la garde propre au module ;
  - pour une action sur un message existant, l'église vient du message, jamais du contexte
    affiché ;
  - « vu » et « fermé » vérifient que l'appelant fait partie du public.
- [x] **Permissions** : `messages:publish` (Super Admin, Admin, Secrétaire), déclarée dans le
  manifeste. La matrice de `permissions.test.ts` et le tableau de `CLAUDE.md` sont mis à jour
  dans le même commit.
- [x] **Validation** Zod sur toutes les mutations : création, modification, retrait, décompte du
  public, vu, fermé.
- [x] **Migration** Prisma `add_system_messages`.
- [x] **Enums** depuis `@/generated/prisma/client` (`SystemMessageSeverity`, `Role`).
- [x] **UI** :
  - composants de `src/components/ui/` : `PageHeader`, `DataTable`, `Field`, `Select`,
    `CheckboxGroup`, `Button`, `ConfirmModal`, `StatusChip`, `Alert`, `useToast` ;
  - un seul composant nouveau, le bandeau `SystemMessageBanner`.
- [x] **ADR** : un message Urgent qui passe outre la préférence email modifie la politique de
  notification (ADR-0016). Ce choix sera consigné dans l'**ADR-0025**, créé avec l'implémentation.

## Approche générale

1. **Un message est une ligne**, avec :
   - un **public décrit et non figé** : critères de rôle, de ministère et de département ;
   - une période ;
   - une sévérité.

   Le public est **évalué au moment de l'affichage** : une personne qui rejoint le public pendant
   la période voit le bandeau (spec). Il est **résolu en liste de comptes** une seule fois, au
   début de la période, pour la notification.
2. **Les reçus** (« vu », « fermé ») sont une ligne par personne et par message. Ils donnent les
   statistiques globales et le masquage du bandeau sur tous les appareils.
3. **La notification** passe par les helpers existants (`notifyUsers`), dans un nouveau domaine
   `system-messages`. La cloche, l'email et l'appareil suivent donc les specs 053 et 068 sans
   code parallèle.
   - **Exception Urgent** : une option `emailPolicy: "always"` des helpers envoie l'email même
     si la préférence est coupée (ADR-0025).
   - L'appareil suit toujours la préférence.
4. **Le déclenchement au début** :
   - pour un message immédiat : envoi direct, juste après la publication, hors transaction ;
   - pour un message programmé : une tâche cron `system-messages` (`every-run`), qui sert aussi
     de rattrapage pour les messages immédiats ;
   - la prise de main atomique sur `notifiedAt` garantit un seul envoi, comme `pushedAt`
     (spec 068).
5. **Le bandeau** est lu par le layout `(auth)` côté serveur : messages actifs des églises de
   l'utilisateur et messages d'instance, reçus exclus. Il est rendu par un composant client au
   haut de `AuthLayoutShell`.

## Modèle de données

```prisma
enum SystemMessageSeverity {
  INFO
  IMPORTANT
  URGENT
}

/// Message système (spec 071). `churchId` nul : message d'instance (Super Admin).
model SystemMessage {
  id             String                @id @default(cuid())
  churchId       String?
  title          String                @db.VarChar(120)
  body           String                @db.Text
  linkUrl        String?               @db.VarChar(500)
  linkLabel      String?               @db.VarChar(60)
  severity       SystemMessageSeverity @default(INFO)
  /// Public : { roles: Role[], ministryIds: string[], departmentIds: string[], headsOnly: boolean }.
  /// Tableaux vides = pas de restriction sur ce critère ; tout vide = toute l'église (ou l'instance).
  audience       Json
  startsAt       DateTime
  endsAt         DateTime
  /// Posé à la prise en charge de la notification (une seule fois).
  notifiedAt     DateTime?
  /// Nombre de comptes notifiés au début de la période.
  recipientCount Int?
  withdrawnAt    DateTime?
  createdById    String?
  updatedById    String?
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  church    Church?                @relation(fields: [churchId], references: [id], onDelete: Cascade)
  createdBy User?                  @relation("SystemMessageCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  updatedBy User?                  @relation("SystemMessageUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  receipts  SystemMessageReceipt[]

  @@index([churchId, startsAt])
  @@index([startsAt, endsAt])
  @@index([notifiedAt, startsAt])
  @@map("system_messages")
}

/// Vu / fermé par une personne (spec 071) : une ligne par compte et par message.
model SystemMessageReceipt {
  messageId   String
  userId      String
  seenAt      DateTime  @default(now())
  dismissedAt DateTime?

  message SystemMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([messageId, userId])
  @@index([userId])
  @@map("system_message_receipts")
}
```

- La migration `add_system_messages` crée l'enum, les deux tables et les relations inverses sur
  `Church` et `User`.
- Le public est en **JSON** plutôt qu'en tables de liaison. Il est toujours lu en entier avec le
  message, n'est jamais interrogé seul, et sa forme est validée par Zod à l'écriture comme à la
  lecture (`audienceSchema`).

## Résolution du public

Elle est faite par `src/modules/messages/services/audience.ts`. Les deux fonctions partagent
une même définition : « la personne appartient au public si… ».

- **`resolveRecipients(message)`** donne la liste des comptes, pour la notification et le
  décompte.
  - **Église** : les comptes ayant un rôle dans l'église (`UserChurchRole`). Pour un message
    d'instance, tous les comptes ayant au moins un rôle dans une église active.
  - **Rôles** : filtre sur `UserChurchRole.role`.
  - **Ministères et départements**, en union :
    - les **responsables** : `UserDepartment` du département, ou `UserChurchRole.ministryId` pour
      un Ministre et son ministère ;
    - sauf si `headsOnly`, les **membres** : `MemberDepartment` → `MemberUserLink` validé de
      l'église → `userId`.
  - Critères combinés : **ET** entre les familles (rôle ET ministère/département), **OU** à
    l'intérieur d'une famille.
  - Avec des rôles et un ministère ou un département, le rôle s'applique au compte retenu
    (« Resp. département du ministère Louange »).
  - Le résultat est dédoublonné.
- **`isInAudience(message, viewer)`** évalue la même règle pour une personne. `viewer` vient de
  la session (`churchRoles` avec rôle, ministère et départements de responsabilité), complétée
  de ses départements d'appartenance. Ces derniers sont lus une fois par requête, seulement si
  un message actif cible des départements.
- **`countAudience(input)`** sert l'aperçu « N personnes visées ». Il compte aussi les fiches
  STAR concernées **sans compte lié**, pour la mention « N STAR sans compte ».

## API

Toutes les routes sont déclarées dans le manifeste `messages` (ADR-0012), avec un
`contract.ts`, puis `npm run openapi`.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/system-messages` | GET | `messages:publish` (`churchId` en query) ; messages d'instance en lecture seule | `churchId` | liste : en cours, programmés, passés, avec statistiques |
| `/api/system-messages` | POST | `messages:publish` dans `churchId` ; `scope: "instance"` exige le Super Admin | `createSchema` | message créé (201) |
| `/api/system-messages/audience-count` | POST | idem | `{ churchId \| scope, audience }` | `{ recipients, membersWithoutAccount }` |
| `/api/system-messages/[id]` | GET | auteur (même garde) **ou** personne du public | — | détail (et statistiques pour l'auteur) |
| `/api/system-messages/[id]` | PATCH | garde auteur sur l'église du message | `updateSchema` : titre, texte, lien et fin si en cours ; tout si programmé | message |
| `/api/system-messages/[id]/withdraw` | POST | garde auteur | — | message (`withdrawnAt`) |
| `/api/system-messages/[id]/receipt` | POST | `requireAuth`, et la personne est dans le public | `{ action: "seen" \| "dismiss" }` | 204 |

**Schémas Zod** (`src/modules/messages/schemas.ts`, purs) :
- `audienceSchema` : rôles dans l'enum `Role`, identifiants en chaînes, `headsOnly` booléen.
- `createSchema` :
  - titre de 1 à 120 caractères, texte de 1 à 2 000 ;
  - lien `https://` ou chemin relatif commençant par `/` ;
  - libellé de lien facultatif ;
  - sévérité ;
  - `startsAt` facultatif (défaut : maintenant), `endsAt` obligatoire ;
  - `superRefine` : fin après début, fin dans le futur, au plus 90 jours.
- `updateSchema` : sous-ensemble partiel du précédent. Le service refuse de changer le public ou
  la sévérité d'un message déjà commencé (`400`).

**Règles serveur** :
- Public vide (0 compte) : `400` « Aucun compte ne correspond à ce public ».
- Ministères et départements vérifiés comme appartenant à l'église du message (pas de fuite
  entre églises).
- Un message retiré ou passé n'est plus modifiable.

## Services / logique métier

Le module `src/modules/messages/` comprend :

- **`manifest.ts`** :
  - `permissions: { "messages:publish": ["SUPER_ADMIN", "ADMIN", "SECRETARY"] }` ;
  - routes :
    - `authenticated` : `/admin/messages` et `/messages` ;
    - `api` : `/api/system-messages` ;
  - `notificationDomains` : `{ key: "system-messages", label: "Messages de l'administration",
    description: "Maintenances, nouveautés et consignes publiées par l'administration de votre
    église ou de Koinonia.", defaultEmail: true }`. Pas de `visibleWith` : tout le monde peut en
    recevoir ;
  - `navigation` : rien ; l'entrée est dans `configLinksDef`.
- **`auth.ts`** : `requireMessageAuthorAccess(session, message | { churchId })`, qui applique
  `messages:publish` dans l'église, et le Super Admin si `churchId` est nul.
- **`services/messages.ts`** :
  - `listMessages(churchId, viewer)` : messages de l'église et d'instance, groupés par état,
    avec les statistiques ;
  - `createMessage(input, actor)`, puis `dispatchDueMessages()` si le début est déjà atteint ;
  - `updateMessage(id, input, actor)` et `withdrawMessage(id, actor)` ;
  - `getMessageForViewer(id, viewer)` ;
  - `logAudit` en `CREATE`, `UPDATE` (dont le retrait, `details.withdrawn`), `entityType:
    "SystemMessage"`, avec `churchId` (nul pour l'instance).
- **`services/banner.ts`** : `getActiveBannerMessages(session)`.
  - Messages où `startsAt ≤ maintenant < endsAt`, non retirés, d'une église de l'utilisateur ou
    d'instance.
  - Filtrés par `isInAudience`.
  - Sans reçu fermé, sauf Urgent.
  - Triés : Urgent, puis Important, puis Information, puis le plus récent.
- **`services/receipts.ts`** : `recordReceipt(messageId, userId, action)`.
  - `upsert`, idempotent ;
  - `dismiss` refusé (`400`) pour un message Urgent.
- **`services/dispatch.ts`** : `dispatchDueMessages()`.
  - Prise de main par `updateMany({ where: { id, notifiedAt: null, withdrawnAt: null,
    startsAt ≤ maintenant, endsAt > maintenant }, data: { notifiedAt } })`.
  - Puis `resolveRecipients` et `notifyUsers(userIds, { domain: "system-messages", type:
    "SYSTEM_MESSAGE", title, message: extrait du texte, link: "/messages/<id>", entityType:
    "SystemMessage", entityId }, { emailPolicy: severity === "URGENT" ? "always" : undefined })`.
  - Enfin `recipientCount` est enregistré.
  - Exporté pour la tâche cron `system-messages` (`every-run`), branchée dans
    `src/app/api/cron/route.ts` sous `registry.has("messages")`.

**Modification partagée** dans `src/lib/notifications.ts` (ADR-0025) :
- `NotificationOptions.emailPolicy?: "preference" | "always"`, avec `"preference"` par défaut ;
- `dispatchUserEmails(userIds, domain, content, { ignorePreference })`. Avec `always`, seul le
  manque d'adresse empêche l'envoi ;
- le pied de l'email devient « Message urgent : envoyé à toutes les personnes concernées,
  quelles que soient leurs préférences ».

Aucun autre site d'appel ne change.

## UI / composants

- **Bandeau** (`src/components/SystemMessageBanner.tsx`, client), monté par
  `(auth)/layout.tsx` via une nouvelle prop `banner` de `AuthLayoutShell`, rendue au-dessus de
  `<main>`, sous la barre supérieure.
  - Fond par sévérité : `info-soft`, `warning-soft`, `danger-soft`, avec icône et texte en `ink`.
  - Contenu : titre, début du texte (une ligne, tronquée) et « Lire » vers `/messages/<id>`.
  - Croix (`IconButton`) sauf pour Urgent. Au premier affichage, un « vu » est envoyé, une seule
    fois par message et par session de page.
  - Plusieurs messages : un seul affiché, « 1 sur N » et des flèches.
  - La fermeture est optimiste : le bandeau disparaît tout de suite, puis l'appel part.
  - `MoreSheet.tsx` et `NavPageList.tsx` ne changent pas.
- **Page `/messages/[id]`** (serveur) :
  - contenu : titre, sévérité (`StatusChip`), texte avec retours à la ligne, lien, auteur
    affiché (« Secrétariat de <église> » ou « Administration de Koinonia ») et date ;
  - ouvrir la page compte comme « vu » ;
  - `404` si la personne n'est ni dans le public ni auteur.
- **Administration `/admin/messages`** (serveur et client) :
  - accès : `requireChurchPermission("messages:publish", churchId)`, sinon redirection ;
  - liste en trois onglets (`Tabs`) : En cours, Programmés, Passés. Colonnes : titre, sévérité,
    public résumé, période, « visées · vues · fermées », actions ;
  - formulaire dans une page `/admin/messages/new` et `/admin/messages/[id]` :
    - champs : titre, texte, lien et libellé, sévérité (cartes radio avec aperçu de couleur) ;
    - public :
      - « Toute l'instance » : Super Admin seulement ;
      - « Toute l'église » ou « Choisir » : rôles en `CheckboxGroup`, ministères et
        départements en `CheckboxGroup` groupé par ministère, case « Responsables seulement » ;
    - période : début (« Maintenant » ou une date) et fin ;
    - **décompte en direct** (`audience-count`, appel retardé), avec la mention des STAR sans
      compte ;
    - **aperçu** du bandeau et de la notification ;
    - `Alert` : pas d'information sensible, le texte peut apparaître sur un écran verrouillé ;
  - « Retirer maintenant » avec `ConfirmModal`.
  - Les messages d'instance apparaissent dans la liste d'une église, en lecture seule, avec la
    mention « Koinonia ».
- **Navigation** :
  - `configLinksDef` : « Messages système », `permissions: ["messages:publish"]`, si
    `registry.has("messages")` ;
  - `CONFIG_BLOCKS["/admin/messages"] = "Organisation"` ;
  - instantanés `layout-props` mis à jour.
- **« Mes notifications »** : le domaine apparaît de lui-même (registre). Aucune modification.

## Décisions & alternatives écartées

- **Choix** : public stocké comme **critères**, évalué à l'affichage et résolu au début pour la
  notification.
  - *Pourquoi* : la spec veut que les nouveaux arrivants voient le bandeau, sans notification
    rétroactive.
  - **Écarté : une ligne par destinataire dès la publication**. *Raison* : figée, elle ne suit
    pas les arrivées. Elle serait aussi coûteuse pour un message d'instance.
- **Choix** : le public en **JSON** validé par Zod.
  - **Écarté : des tables de liaison (rôles, ministères, départements)**. *Raison* : jamais
    interrogées seules ; elles ajouteraient trois tables pour une donnée lue d'un bloc.
- **Choix** : réutiliser `notifyUsers` et le domaine `system-messages`.
  - *Pourquoi* : la cloche, l'email et l'appareil suivent automatiquement les préférences
    (specs 053 et 068).
  - **Écarté : un `sendEmail` direct pour l'Urgent**. *Raison* : interdit par `CLAUDE.md` pour
    un compte existant. L'exception passe par le helper et reste explicite (ADR-0025).
- **Choix** : cron `every-run` avec un envoi immédiat à la publication.
  - *Pourquoi* : précision de 5 minutes pour un message programmé, sans attente pour un message
    immédiat, et un seul envoi garanti par `notifiedAt`.
- **Choix** : nouveau module `messages`, optionnel.
  - *Pourquoi* : domaine métier propre, désactivable par instance (ADR-0011).
  - **Écarté : l'ajouter au module `core`**. *Raison* : `core` est le noyau obligatoire ; cette
    fonctionnalité ne l'est pas.
- **Choix** : nom de modèle `SystemMessage`.
  - **Écarté : `Announcement`**. *Raison* : déjà pris par les demandes d'annonce du culte.
- **Choix** : les reçus portent le masquage, donc **fermé sur tous les appareils**, comme le veut
  la spec. **Écarté : `localStorage`**. *Raison* : le masquage serait propre à chaque appareil.

## Risques & points d'attention

- **Coût dans le layout** : une requête des messages actifs à chaque page authentifiée.
  - Index `[startsAt, endsAt]` ; résultat généralement vide.
  - Les départements d'appartenance ne sont lus que si un message actif cible des départements.
  - La lecture est mise en cache le temps de la requête (`cache()` de React).
- **Message d'instance très large** : `notifyUsers` fait un `createMany` sur des milliers de
  lignes, puis l'email et l'appareil.
  - Envoi par lots de 500 dans `dispatchDueMessages`.
  - Les emails passent par `Promise.allSettled`, déjà en place.
- **Écran verrouillé** : le texte de la notification est le titre et un extrait. L'avertissement
  à l'auteur couvre le cas, comme la règle de la spec 068.
- **Urgent** : la règle « email toujours » ne s'applique qu'ici. Elle est testée et documentée
  (ADR-0025, `CLAUDE.md`) pour ne pas devenir un contournement ailleurs.
- **Fuseau horaire** : les dates sont saisies dans l'heure de Paris, comme le reste de l'app, et
  stockées en UTC.

## Stratégie de tests

Vitest, Prisma mocké :

- **`audience.test.ts`** :
  - église entière ;
  - rôles ;
  - département, membres et responsables ;
  - `headsOnly` ;
  - ministère : Ministre et départements du ministère ;
  - combinaisons ET et OU ;
  - dédoublonnage ;
  - message d'instance ;
  - fiches sans compte comptées à part ;
  - `isInAudience` cohérent avec `resolveRecipients` sur les mêmes cas.
- **`messages.test.ts`** :
  - création : fin avant le début, fin passée, public vide, ministère d'une autre église ;
  - instance refusée hors Super Admin ;
  - modification d'un message en cours limitée au titre, au texte, au lien et à la fin ;
  - retrait ;
  - journal.
- **`dispatch.test.ts`** :
  - un seul envoi (prise de main) ;
  - message programmé non envoyé avant son début ;
  - message retiré jamais envoyé ;
  - Urgent avec `emailPolicy: "always"` ;
  - `recipientCount` enregistré ;
  - lots.
- **`banner.test.ts`** :
  - période ;
  - églises de l'utilisateur ;
  - public ;
  - fermé exclu sauf Urgent ;
  - ordre par sévérité.
- **`receipts.test.ts`** : `seen` idempotent ; `dismiss` refusé pour un Urgent.
- **`notifications.test.ts`** (existant, étendu) :
  - `emailPolicy: "always"` envoie malgré une préférence coupée ;
  - sans adresse, rien n'est envoyé ;
  - le comportement par défaut est inchangé.
- **Routes** :
  - `403` pour Ministre, Resp. département et STAR ;
  - instance refusée à l'Admin ;
  - `404` sur le détail hors public ;
  - reçu hors public refusé ;
  - contrats et `openapi.test.ts`.
- **Permissions** : matrice figée `permissions.test.ts` (`messages:publish`).
- **Navigation** : instantanés `layout-props` (Admin et Secrétaire voient « Messages système »).
- **Cron** : `cron-modules.test.ts` (tâche `system-messages` sous `registry.has`).
- **Hors Vitest** (recette staging) :
  - message immédiat, puis programmé à 5 minutes ;
  - Urgent avec l'email coupé ;
  - fermeture sur ordinateur, vérifiée sur téléphone ;
  - nouveau rôle en cours de période ;
  - statistiques.
