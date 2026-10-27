# Tâches — Messages système (annonces internes)

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée (recette staging à faire)

> Tâches **ordonnées** et **vérifiables** : migration → services → API → UI → tests. Les tâches
> `[P]` sont parallélisables.

## Prérequis

- [x] Branche de travail contenant les specs 068 à 070 (helpers de notification avec envoi
  natif), donc la PR #703 ou cette même branche.

## Tâches

### 1. Données & migration

- [x] **T1** — Enum `SystemMessageSeverity` et modèles `SystemMessage` et `SystemMessageReceipt`.
  Relations inverses sur `Church` (`systemMessages`) et `User` (`systemMessagesCreated`,
  `systemMessagesUpdated`, `systemMessageReceipts`). *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Migration `add_system_messages`, puis régénération du client.
  *(fichiers : `prisma/migrations/<horodatage>_add_system_messages/`, `src/generated/prisma/`)*

### 2. Module `messages` : déclaration et schémas

- [x] **T3** — Manifeste :
  - `permissions` : `messages:publish` pour Super Admin, Admin et Secrétaire ;
  - `routes` :
    - `authenticated` : `/admin/messages` et `/messages` ;
    - `api` : `/api/system-messages` ;
  - `notificationDomains` : `system-messages`, « Messages de l'administration »,
    `defaultEmail: true`.

  Enregistrement dans `allManifests`, avec le compteur du commentaire à 14.
  *(fichiers : `src/modules/messages/manifest.ts`, `src/lib/manifests.ts`)*
- [x] **T4** [P] — Schémas purs :
  - `audienceSchema` : rôles de l'enum `Role`, `ministryIds`, `departmentIds`, `headsOnly` ;
  - `createSchema` et `updateSchema` :
    - titre de 1 à 120 caractères, texte de 1 à 2 000 ;
    - lien `https://` ou chemin `/…`, avec son libellé ;
    - sévérité ;
    - début facultatif, fin obligatoire ;
    - `superRefine` : fin après le début, fin dans le futur, au plus 90 jours ;
  - `receiptSchema` ;
  - `audienceCountSchema` ;
  - `scope: "church" | "instance"`.

  *(fichier : `src/modules/messages/schemas.ts`)*
- [x] **T5** — Matrice des permissions : ajouter `messages:publish` à
  `src/core/__tests__/permissions.test.ts` et au tableau de `CLAUDE.md`, dans le même commit.

### 3. Notifications partagées (ADR-0025)

- [x] **T6** — Ajouter `NotificationOptions.emailPolicy?: "preference" | "always"`, transmis à
  `dispatchUserEmails(…, { ignorePreference })`.
  - Avec `always`, seule l'absence d'adresse empêche l'envoi.
  - Le pied de l'email est alors propre aux messages urgents.
  - Le comportement par défaut ne change pas.

  *(fichiers : `src/lib/notifications.ts`, `src/lib/email.ts` si un nouveau pied est utile)*
- [x] **T7** [P] — ADR-0025 : « Email envoyé malgré la préférence pour un message urgent ».
  - Contexte : ADR-0016.
  - Décision : la règle ne vaut que pour les messages système Urgent.
  - Conséquences : passe obligatoirement par le helper, et `sendEmail` direct reste interdit.

  Mettre à jour l'index des ADR. *(fichiers : `docs/adr/0025-email-urgent-hors-preference.md`,
  `docs/adr/README.md`)*

### 4. Services du module

- [x] **T8** — Public :
  - `resolveRecipients(message)` :
    - église ou instance ;
    - rôles ;
    - ministères : responsables, et membres sauf `headsOnly` ;
    - départements : responsables (`UserDepartment`), et membres (`MemberDepartment` vers
      `MemberUserLink` validé) sauf `headsOnly` ;
    - ET entre les familles de critères, OU à l'intérieur d'une famille ;
    - dédoublonnage.
  - `isInAudience(message, viewer)`, avec la même règle.
  - `countAudience(input)`, qui renvoie `{ recipients, membersWithoutAccount }`.
  - `loadViewer(session)` : rôles depuis la session, et départements d'appartenance lus à la
    demande.

  *(fichier : `src/modules/messages/services/audience.ts`)*
- [x] **T9** — Garde `requireMessageAuthorAccess` :
  - `messages:publish` dans l'église du message ;
  - Super Admin si le message vise toute l'instance.

  *(fichier : `src/modules/messages/auth.ts`)*
- [x] **T10** — Gestion des messages :
  - `listMessages(churchId, viewer)` : en cours, programmés et passés, avec les messages
    d'instance en lecture seule et les statistiques (visées, vues, fermées) ;
  - `createMessage(input, actor)` :
    - ministères et départements vérifiés dans l'église ;
    - public vide refusé (`400`) ;
    - journal ;
    - `dispatchDueMessages()` si le message commence tout de suite ;
  - `updateMessage(id, input, actor)` : message programmé modifiable en entier ; message en
    cours limité au titre, au texte, au lien et à la fin ; message passé ou retiré refusé ;
  - `withdrawMessage(id, actor)` ;
  - `getMessageForViewer(id, viewer)` : `404` hors public, sauf pour l'auteur ;
  - `logAudit` avec `entityType: "SystemMessage"`, `churchId` nul pour l'instance.

  *(fichier : `src/modules/messages/services/messages.ts`)*
- [x] **T11** [P] — Bandeau : `getActiveBannerMessages(session)`.
  - Messages de la période, non retirés, des églises de l'utilisateur ou de l'instance.
  - Filtrés par `isInAudience`.
  - Fermés exclus, sauf les Urgents.
  - Triés par sévérité, puis du plus récent au plus ancien.
  - Mis en cache pour la requête (`cache()`).

  *(fichier : `src/modules/messages/services/banner.ts`)*
- [x] **T12** [P] — Reçus : `recordReceipt(messageId, userId, "seen" | "dismiss")`.
  - Par `upsert`, idempotent.
  - « Fermer » est refusé pour un Urgent.

  *(fichier : `src/modules/messages/services/receipts.ts`)*
- [x] **T13** — Envoi : `dispatchDueMessages()`.
  - Prise de main atomique sur `notifiedAt`.
  - `resolveRecipients`, puis `notifyUsers` par lots de 500 :
    - domaine `system-messages`, type `SYSTEM_MESSAGE` ;
    - lien `/messages/<id>` ;
    - `entityType` et `entityId` ;
    - `emailPolicy: "always"` si Urgent.
  - Enregistrement de `recipientCount`.

  *(fichier : `src/modules/messages/services/dispatch.ts`)*
- [x] **T14** — Index du module : exporter les services et `messagesModule`.
  *(fichier : `src/modules/messages/index.ts`)*
- [x] **T15** — Tâche cron `system-messages` (`every-run`), sous `registry.has("messages")`, par
  import dynamique. *(fichier : `src/app/api/cron/route.ts`)*

### 5. API

- [x] **T16** — Contrats (ADR-0023) pour chaque route, avec les schémas importés de
  `@/modules/messages/schemas`. *(fichiers : `src/app/api/system-messages/contract.ts`,
  `audience-count/contract.ts`, `[id]/contract.ts`, `[id]/withdraw/contract.ts`,
  `[id]/receipt/contract.ts`)*
- [x] **T17** — Routes :
  - `GET` et `POST /api/system-messages` ;
  - `POST /api/system-messages/audience-count` ;
  - `GET` et `PATCH /api/system-messages/[id]` ;
  - `POST /api/system-messages/[id]/withdraw` ;
  - `POST /api/system-messages/[id]/receipt`.

  Contraintes communes :
  - `await params` ;
  - église lue sur le message pour les routes `[id]` ;
  - limite de débit sur les mutations.

  *(fichiers : `src/app/api/system-messages/**/route.ts`)*
- [x] **T18** — `npm run openapi` et commit de `docs/openapi.json`. Vérifier
  `route-exhaustiveness` et `lint:prisma-boundary` : les routes passent par le module, le seuil
  ne monte pas.

### 6. UI

- [x] **T19** — Composant `SystemMessageBanner` (client) :
  - couleur selon la sévérité (`info-soft`, `warning-soft`, `danger-soft`) ;
  - titre, extrait et « Lire » ;
  - croix sauf pour un Urgent, avec fermeture optimiste ;
  - « 1 sur N » et des flèches ;
  - « vu » envoyé une fois par message et par affichage de page ;
  - tokens sémantiques.

  *(fichier : `src/components/SystemMessageBanner.tsx`)*
- [x] **T20** — Branchement :
  - prop `banner` sur `AuthLayoutShell`, rendue au-dessus de `<main>` ;
  - `(auth)/layout.tsx` lit `getActiveBannerMessages` sous `registry.has("messages")`.

  Ne modifier ni `MoreSheet.tsx` ni `NavPageList.tsx`. *(fichiers :
  `src/components/AuthLayoutShell.tsx`, `src/app/(auth)/layout.tsx`)*
- [x] **T21** — Page `/messages/[id]` (serveur) :
  - titre, sévérité, texte avec ses retours à la ligne, lien ;
  - auteur affiché : « Secrétariat de <église> » ou « Administration de Koinonia » ;
  - date ;
  - « vu » enregistré à l'ouverture ;
  - `notFound()` hors public.

  *(fichier : `src/app/(auth)/messages/[id]/page.tsx`)*
- [x] **T22** — Liste `/admin/messages` (serveur et client) :
  - garde `messages:publish`, sinon redirection ;
  - onglets En cours, Programmés et Passés (`Tabs`) ;
  - colonnes : titre, sévérité, public résumé, période, « visées · vues · fermées » ;
  - « Retirer maintenant » (`ConfirmModal`) ;
  - messages d'instance en lecture seule, avec la mention « Koinonia ».

  *(fichiers : `src/app/(auth)/admin/messages/page.tsx`, `MessagesClient.tsx`)*
- [x] **T23** — Formulaire, création et modification :
  - titre, texte, lien et libellé ;
  - sévérité en cartes radio ;
  - public :
    - « Toute l'instance », Super Admin seulement ;
    - « Toute l'église » ;
    - « Choisir » : rôles, ministères et départements (`CheckboxGroup`), « Responsables
      seulement » ;
  - période ;
  - décompte en direct, retardé, avec les STAR sans compte ;
  - aperçu du bandeau et de la notification ;
  - `Alert` « pas d'information sensible » ;
  - en modification d'un message en cours : public et sévérité verrouillés.

  *(fichiers : `src/app/(auth)/admin/messages/new/page.tsx`,
  `src/app/(auth)/admin/messages/[id]/page.tsx`, `MessageForm.tsx`)*
- [x] **T24** [P] — Navigation :
  - `configLinksDef` : « Messages système », `permissions: ["messages:publish"]`, si
    `registry.has("messages")` ;
  - `CONFIG_BLOCKS["/admin/messages"] = "Organisation"` ;
  - mise à jour des instantanés `layout-props`.

  *(fichiers : `src/app/(auth)/layout.tsx`, `src/lib/navigation.ts`)*

### 7. Tests

- [x] **T25** [P] — `audience.test.ts` :
  - église entière ;
  - rôles ;
  - département (membres et responsables) et `headsOnly` ;
  - ministère ;
  - combinaisons ET et OU ;
  - dédoublonnage ;
  - instance ;
  - fiches sans compte ;
  - cohérence entre `isInAudience` et `resolveRecipients`.

  *(fichier : `src/modules/messages/__tests__/audience.test.ts`)*
- [x] **T26** [P] — `messages.test.ts` :
  - refus : dates incohérentes, public vide, ministère d'une autre église, instance hors Super
    Admin ;
  - modification limitée d'un message en cours ;
  - retrait ;
  - journal ;
  - envoi immédiat déclenché.

  *(fichier : `src/modules/messages/__tests__/messages.test.ts`)*
- [x] **T27** [P] — `dispatch.test.ts` :
  - un seul envoi ;
  - un message programmé ou retiré n'est pas envoyé ;
  - Urgent avec `emailPolicy: "always"` ;
  - `recipientCount` ;
  - lots.

  *(fichier : `src/modules/messages/__tests__/dispatch.test.ts`)*
- [x] **T28** [P] — `banner.test.ts` et `receipts.test.ts` :
  - période, églises, public ;
  - fermé exclu sauf Urgent ;
  - ordre ;
  - « vu » idempotent ;
  - fermeture d'un Urgent refusée.

  *(fichiers : `src/modules/messages/__tests__/`)*
- [x] **T29** — `notifications.test.ts` (étendu) :
  - `emailPolicy: "always"` envoie malgré une préférence coupée ;
  - sans adresse, rien n'est envoyé ;
  - comportement par défaut inchangé.

  *(fichier : `src/lib/__tests__/notifications.test.ts`)*
- [x] **T30** — Routes :
  - `403` pour Ministre, Resp. département et STAR ;
  - instance refusée à l'Admin ;
  - `404` sur le détail hors public ;
  - reçu hors public refusé ;
  - `PATCH` d'un message en cours qui change le public : `400`.

  *(fichiers : `src/app/api/system-messages/**/__tests__/route.test.ts`)*
- [x] **T31** — Cron et registre :
  - `cron-modules.test.ts` : tâche `system-messages` ;
  - domaine `system-messages` visible dans les préférences.

### 8. Documentation & livraison

- [x] **T32** [P] — `CLAUDE.md` :
  - section « Spécificités du module messages » ;
  - mention de l'exception Urgent dans le paragraphe des notifications, avec renvoi à l'ADR-0025.

  Puis `docs/database.md` (deux tables) et `docs/auth.md` (permission).
- [x] **T33** [P] — Guide : entrées « Messages système » (Admin, Secrétaire, Super Admin) et
  « Bandeau d'information » (tous les rôles). *(fichier : `src/components/GuideContent.tsx`)*
- [x] **T34** — CHANGELOG, section « Non publié » › « Ajouté ».

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run lint:prisma-boundary`, seuil inchangé
- [x] `npm run test`
- [x] `npm run build`
- [ ] Migration rejouée sur base vierge (job CI `migrations`)
- [ ] Recette staging :
  - message immédiat, puis programmé à 5 minutes ;
  - Urgent avec l'email coupé ;
  - fermeture sur ordinateur, vérifiée sur téléphone ;
  - nouveau rôle en cours de période ;
  - statistiques ;
  - retrait.
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (correspondance ci-dessous)
- [ ] PR (fusion groupée avec la PR #703)

## Correspondance critères d'acceptation → tâches

| Critère (spec) | Tâches |
|---|---|
| Publication par Super Admin (instance ou église), Admin et Secrétaire (leur église) ; refus pour les autres rôles | T3, T5, T9, T17, T22, T30 |
| Public par église, rôle, ministère ou département, combinable ; décompte avant publication | T4, T8, T17, T23, T25 |
| Bandeau pendant la période, pour les seules personnes visées, sur toutes les pages | T11, T19, T20, T28 |
| Fermeture définitive sur tous les appareils (sauf Urgent) | T1, T12, T19, T28 |
| Notification dans la cloche au début de la période | T13, T15, T27 |
| Email et appareil selon la préférence « Messages de l'administration » ; Urgent par email malgré tout | T3, T6, T7, T13, T29 |
| Message programmé invisible avant son début et retiré à sa fin | T11, T13, T27, T28 |
| Fin obligatoire et après le début ; public vide refusé | T4, T10, T26 |
| Statistiques visées, vues et fermées, sans liste nominative | T10, T12, T22 |
| Correction sans renotification ; retrait immédiat ; message programmé modifiable | T10, T17, T23, T26, T30 |
| Historique avec auteur et date | T10, T26 |
| Aucun message visible d'une église à l'autre | T8, T10, T11, T25, T28 |
