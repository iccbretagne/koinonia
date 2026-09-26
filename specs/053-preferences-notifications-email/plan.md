# Plan technique — Préférences de notifications par email

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-25

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : les modules déclarent leurs domaines dans leur manifeste ; `src/app/`
      n'importe rien de nouveau hors index. Le service central vit dans `src/lib/` (infrastructure
      partagée, comme `notifications.ts` aujourd'hui).
- [x] **Sécurité** : les deux routes nouvelles portent sur les données **de l'appelant uniquement**
      (`requireAuth()`, `userId` = session, jamais lu du body) ; aucune permission d'église n'est
      évaluée. Les préférences sont par personne, communes à toutes ses églises (décision de la spec).
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) pour décider quels domaines afficher.
- [x] **Validation** Zod sur le `PUT` (clés de domaine validées contre le registre).
- [x] **Migration** Prisma : une table et une colonne nullable (voir « Modèle de données »).
- [x] **Enums** : aucun nouvel enum ; le domaine est une chaîne validée par le registre (voir décisions).
- [x] **UI** : `Button`, `CheckboxGroup` réutilisés ; pas de nouveau composant générique.
- [x] **ADR** : la règle « un domaine par notification, email décidé centralement » est
      transverse à tous les modules et durable → **ADR-0016** (tâche du lot 1).

## Approche générale

Aujourd'hui, 13 fichiers appellent `sendEmail()` directement, chacun décidant seul d'écrire ou non,
et ~30 sites créent des notifications in-app, dont plusieurs par `prisma.notification.create`
directement. Le fil directeur :

1. **Chaque notification appartient à un domaine**, déclaré par le manifeste du module qui
   l'émet (planning, suivi pastoral, intégration, comptabilité, salles, médias, emploi) ou par le
   manifeste `core` (compte et accès).
2. **Un seul point de sortie pour les emails à des utilisateurs** : les helpers de
   `src/lib/notifications.ts` reçoivent le domaine, créent la notification in-app, puis envoient
   l'email à ceux des destinataires dont la préférence (globale + domaine) l'autorise, avec le pied
   de page « Pourquoi je reçois cet email ». Un appel direct à `sendEmail()` n'est plus permis que
   pour les destinataires **sans compte** (demandeur externe, nouvel arrivant, profil pastoral sans
   compte) et les **adresses configurées de l'église** (digest du secrétariat) — liste blanche
   vérifiée par un test.
3. **Une page `/profile/notifications`** et une route `GET/PUT /api/notifications/preferences`.

Deux lots, sur la branche `feat/preferences-notifications-email` :

- **Lot 1 — mécanisme et page, à comportement constant** : registre, modèle, helpers, pied de
  page, page et API, ADR ; migration de **tous les emails existants vers utilisateurs** sur le
  nouveau mécanisme. Aucun nouvel email n'est envoyé ; on peut désormais les couper.
- **Lot 2 — cohérence** : toutes les notifications in-app passent par les helpers avec leur
  domaine ; un domaine activé envoie donc toutes ses notifications par email. Le planning devient
  entièrement couvert (décision de la spec). Tests-gardiens contre les appels directs.

## Modèle de données

```prisma
/// Préférence email d'un utilisateur pour un domaine de notification (spec 053).
/// Absence de ligne = valeur par défaut du domaine (déclarée dans le manifeste).
model NotificationEmailPreference {
  userId  String
  /// Clé de domaine déclarée par un manifeste (`planning`, `care`, …) ou `*` pour
  /// l'interrupteur général. Validée par le registre, pas par un enum.
  domain  String
  enabled Boolean
  updatedAt DateTime @updatedAt
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, domain])
  @@map("notification_email_preferences")
}

model Notification {
  // … champs existants inchangés
  /// Domaine de la notification (spec 053) ; null pour les notifications antérieures non
  /// rattachées par la migration.
  domain String?
  @@index([userId, domain])
}
```

Migration `add_notification_email_preferences` :

- crée `notification_email_preferences` ;
- ajoute `notifications.domain` (nullable) et l'index ;
- **rattache les notifications existantes** à leur domaine par leur `type` (`PLANNING_%`,
  `ABSENCE_%`, `OPENING_CLOSING_%` → `planning` ; `CARE_%`, `APPOINTMENT` → `care` ;
  `INTEGRATION_%` → `integration` ; `ACCOUNTING_%` → `accounting` ; `ROOM_%` → `rooms` ;
  `MEDIA_FILE_%` → `media` ; `ROLE_ASSIGNED`, `MEMBER_LINK_%` → `account` ; `REQUEST_%`,
  `ANNOUNCEMENT_SHEET_%`, types de demandes → `requests` ; `EMPLOI`, `STAGE`, `ALTERNANCE`,
  `JOB_%` → `jobs`). Sert uniquement à la règle d'affichage (« a déjà reçu une notification de ce
  domaine »). Aucune ligne de préférence n'est créée : les défauts restent dans le code.

Les réglages existants de l'emploi (`JobNotificationSubscription`) sont **conservés**, mais
restent un filtre granulaire indépendant (types d'offres suivis, alertes de nouvelles offres) —
décision actée en cours d'implémentation (lot 1, T32-T40) : la préférence générique du domaine
`jobs` (comme tout autre domaine) vit dans `NotificationEmailPreference`, sans lecture ni écriture
de `JobNotificationSubscription.email`. Les deux réglages s'appliquent en cumul (voir T30) plutôt
que de fusionner un champ générique avec un filtre métier fin — plus simple et sans couplage
surprenant entre un interrupteur générique et un réglage détaillé existant.

## Registre des domaines

Champ nouveau du manifeste (`src/core/module-registry.ts`) :

```ts
interface NotificationDomainDescriptor {
  key: string;              // "planning", "care", …
  label: string;            // « Planning et service »
  description: string;      // exemples affichés sur la page
  defaultEmail: boolean;    // défaut « la mise en service ne retire aucun email »
  /** Le domaine est affiché si l'utilisateur détient l'une de ces permissions dans une de ses
   *  églises, ou a déjà reçu une notification de ce domaine. Vide = toujours affiché. */
  visibleWith?: readonly Permission[];
}
// ModuleManifest.notificationDomains?: NotificationDomainDescriptor[]
```

`ModuleRegistry` agrège les domaines des modules actifs (clé unique vérifiée au boot, comme les
permissions). Domaines déclarés :

| Clé | Manifeste | Libellé | `defaultEmail` | `visibleWith` | Emails existants repris |
|---|---|---|---|---|---|
| `planning` | planning | Planning et service | **oui** | `planning:view` | rappels de service (cron) |
| `requests` | planning | Demandes | non | `planning:view`, `media:view` | — |
| `care` | care | Suivi pastoral | **oui** | `care:qualify`, `care:view` | personne désignée, relances, inactivité MSDP |
| `integration` | integration | Intégration | **oui** | `members:manage`, `events:manage` | berger affecté |
| `accounting` | accounting | Comptabilité | **oui** | `accounting:submit`, `accounting:view`, `accounting:manage` | nouvelle demande, statut, paiement |
| `rooms` | rooms | Salles | non | `rooms:manage` | — |
| `media` | media | Médias | non | `media:upload`, `media:review` | — |
| `account` | core | Compte et accès | non | *(toujours)* | — |
| `jobs` | jobs | Emploi | *réglage emploi existant* | `jobs:view` | offres, renouvellement |

Note : la spec suppose qu'aucune notification « Médias » n'existe. Il en existe une (décision sur
un fichier déposé, `MEDIA_FILE_*`) ; le domaine `media` est donc ajouté. La spec sera amendée dans
le même lot (une ligne dans le tableau des domaines).

## Services / logique métier

`src/lib/notifications.ts` (infrastructure partagée, déjà importée par les modules) :

- `createNotification({ userId, domain, type, title, message, link, email? })`
- `notifyUsersWithRole(churchId, role, { domain, … , email? })`
- `notifyDeptMembers(churchId, deptFunction, { domain, …, email? })`
- `notifyUsers(userIds, { domain, …, email? })` — nouveau, pour les sites qui calculent déjà leurs
  destinataires (relances, référents, abonnés emploi).

`domain` est **obligatoire** (TypeScript) : oublier le domaine ne compile pas. `email` est
optionnel : `{ subject, html }` pour garder les gabarits riches existants (comptabilité, rendez-vous,
rappels) ; à défaut, un gabarit générique est construit depuis `title`, `message` et `link`.

Après l'insertion in-app, les helpers appellent `dispatchUserEmails(userIds, domain, content)` :

1. une requête charge l'email des destinataires et leurs préférences (`*` et `domain`) ;
2. `resolveEmailPreference(prefs, domain)` (fonction **pure**, testée) : global désactivé → non ;
   sinon préférence explicite du domaine, sinon `defaultEmail` du domaine — `jobs` compris, sans
   lecture de `JobNotificationSubscription.email` (voir décision ci-dessus) ;
3. pour chaque destinataire retenu avec une adresse, `sendEmail` avec `appendPreferenceFooter(html,
   domainLabel)` (lien `APP_URL + /profile/notifications`) ;
4. toute erreur SMTP est **journalisée et avalée** : l'action métier ne dépend jamais de l'email
   (critère « aucune action n'échoue »).

`src/lib/notification-preferences.ts` : `getPreferencesView(userId)` (domaines visibles + valeur
effective + état global + présence d'une adresse email) et `updatePreferences(userId, input)`.
La visibilité combine `rolePermissions` sur toutes les églises de l'utilisateur et l'existence
d'une notification du domaine pour lui (index `[userId, domain]`).

Sites migrés au **lot 1** (emails existants vers utilisateurs, même contenu, pied de page ajouté) :
comptabilité (3 routes), rappels de service (`cron/reminders`, `cron` tâche rappels), suivi
pastoral (`care/services/notifications.ts`, `followups.ts` inactivité, `relances.ts`), intégration
(`family-service.ts` berger affecté/dessaisi, renvoi), emploi (`jobs/route.ts`,
`lifecycle-service.ts`).

Restent sur `sendEmail` direct (liste blanche) : `care/services/appointments.ts` et
`agenda/requests/[id]/schedule` pour le demandeur **sans compte**, la branche « profil sans compte »
de `care/services/notifications.ts`, la confirmation du nouvel arrivant
(`api/integration/requests`), le digest planning vers `church.secretariatEmails`.

Sites convertis au **lot 2** (in-app seul aujourd'hui) : planning (affectation, retrait, statut,
ouverture/fermeture, absences, feuille d'annonces), demandes (`api/requests`), compte et accès
(`users/[userId]/roles`, `member-link-requests`), salles (`checklist.service.ts`), médias
(`media/files/[id]`), offres d'emploi freelance/chercheurs.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/notifications/preferences` | GET | `requireAuth()` (soi-même) | — | `{ emailEnabled, hasEmail, domains: [{ key, label, description, enabled }] }` |
| `/api/notifications/preferences` | PUT | `requireAuth()` (soi-même) | `{ emailEnabled?: boolean, domains?: Record<string, boolean> }` | même forme que GET |

Zod : `domains` limité aux clés **visibles pour l'appelant** (une clé inconnue ou non visible →
400). Écriture par `upsert` sur `(userId, domain)` pour chaque clé, `jobs` compris (indépendant de
`JobNotificationSubscription.email`, voir décision ci-dessus). Route déclarée dans le manifeste
`core` (ADR-0012), déjà couverte par le préfixe `/api/notifications` — à vérifier par
`route-exhaustiveness.test.ts`.

## UI / composants

- `/profile/notifications` (Server Component) : charge `getPreferencesView`, rend
  `NotificationPreferencesClient`.
- Client : interrupteur général (case à cocher stylée), puis une ligne par domaine (libellé,
  description, case), bouton « Enregistrer » (`Button`, `disabled` pendant l'envoi), message
  « Préférences enregistrées. ». Domaines grisés quand le général est coupé (valeurs conservées).
  Bandeau « Aucune adresse email sur votre compte » si `hasEmail` est faux.
- Réglages emploi détaillés : `JobSubscriptionClient` est déplacé de `/profile` vers cette page,
  sous le domaine « Emploi ».
- `/profile` : lien « Mes notifications » dans la section Compte.

## Décisions & alternatives écartées

- **Choix** : domaines déclarés dans les manifestes — *Pourquoi* : même mécanisme que
  permissions et routes (ADR-0012) ; un module inactif n'expose pas son domaine ; ajouter un module
  qui notifie oblige à déclarer son domaine.
- **Choix** : défauts dans le code, lignes seulement pour les choix explicites — *Pourquoi* :
  aucune donnée à migrer, un défaut peut évoluer sans réécrire des milliers de lignes, et « n'a
  jamais réglé » reste distinguable.
- **Choix** : `domain` en chaîne validée par le registre plutôt qu'un enum Prisma — *Pourquoi* :
  un nouveau domaine ne demande pas de migration ; la validation se fait à l'entrée (Zod) et au
  boot (unicité).
- **Choix** : décision d'envoi centralisée dans les helpers de notification — *Pourquoi* : c'est le
  seul endroit où la règle « un domaine, une préférence » est garantie ; les tests-gardiens
  empêchent le contournement.
- **Écarté** : colonnes booléennes par domaine sur `User` — *Raison* : migration à chaque domaine,
  table NextAuth touchée.
- **Écarté** : fusionner `JobNotificationSubscription` dans la nouvelle table, ou faire lire/écrire
  son champ `email` par la préférence générique du domaine `jobs` — *Raison* : ses réglages sont
  plus fins (types d'offres, in-app) et gouvernent un besoin différent (alertes de nouvelles
  offres) ; les coupler au switch générique surprendrait l'utilisateur (décocher l'un changerait
  l'autre) et laisserait un utilisateur jamais abonné sans ligne où stocker la préférence
  générique. Les deux réglages restent indépendants et s'appliquent en cumul (T30, T31).
- **Écarté** : envoi des emails en file asynchrone — *Raison* : volumes faibles, pas
  d'infrastructure de file aujourd'hui ; l'erreur est avalée et journalisée. À reconsidérer si le
  volume grossit.

## Risques & points d'attention

- **Surprise au lot 2** : le domaine planning étant activé par défaut, les ajouts/retraits de
  service partiront par email pour tous les STAR. Décision de la spec ; à annoncer dans le
  CHANGELOG et à vérifier en recette (volume sur un week-end chargé).
- **Doublons d'emails** : certains sites envoient aujourd'hui in-app et email séparément ; les
  migrer sans supprimer l'ancien `sendEmail` doublerait l'envoi. Chaque site migré supprime son
  appel direct ; le test-gardien le vérifie.
- **Emails groupés** (`to: emails[]` en comptabilité) : passent à un email par destinataire pour
  respecter les préférences individuelles.
- **Visibilité** : un Berger sans `members:manage` ne verrait pas « Intégration » avant d'avoir
  reçu une première notification ; acceptable (la règle d'historique le rattrape).
- **SMTP absent en dev** : comportement actuel conservé (échec avalé).

## Stratégie de tests

- `resolveEmailPreference` (pur) : global coupé, domaine explicite, défaut du domaine, cas `jobs`.
- `dispatchUserEmails` (Prisma mocké, `sendEmail` mocké) : un email par destinataire autorisé ;
  aucun pour préférence coupée ou sans adresse ; pied de page présent ; erreur SMTP avalée.
- Helpers : `domain` transmis à l'in-app ; email générique si pas de gabarit.
- Registre : clés uniques, domaines des modules inactifs absents.
- API : GET renvoie seulement les domaines visibles ; PUT refuse une clé inconnue ou non visible,
  écrit la bonne ligne pour chaque domaine (`jobs` compris, sans toucher à l'abonnement emploi) ;
  401 sans session.
- **Tests-gardiens** : `sendEmail` importé seulement par `src/lib/notifications.ts` et les
  fichiers de la liste blanche ; `prisma.notification.create`/`createMany` absents hors
  `src/lib/notifications.ts` (lot 2).
- Non-régression des tests existants des sites migrés (comptabilité, care, intégration, emploi,
  rappels) : les attentes sur `sendEmail` passent par le nouveau helper.
