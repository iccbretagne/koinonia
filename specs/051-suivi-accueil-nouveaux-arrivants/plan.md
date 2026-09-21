# Plan technique — Suivi de l'accueil des nouveaux arrivants

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-09-21

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : toute la logique nouvelle vit dans `src/modules/integration/services/`
      et s'expose via `src/modules/integration/index.ts`. Les routes `src/app/api/integration/*`
      importent exclusivement `@/modules/integration`. Aucune dépendance inter-modules créée.
- [x] **Sécurité** : les routes authentifiées passent par `requireIntegrationAccess(churchId)`
      (helper du module, ADR-0010) ; le réglage des délais passe par un nouveau helper plus strict
      `requireIntegrationSettingsAccess(churchId)`. `churchId` reste obligatoire partout. La
      soumission publique du formulaire (`POST /api/integration/requests`) reste protégée par
      Turnstile + `requireRateLimit`, inchangé.
- [x] **Permissions** : aucune nouvelle permission dans `rolePermissions`. Le module intégration
      déclare `permissions: {}` et fonctionne par helpers — on conserve ce parti (voir Décisions).
- [x] **Validation** Zod sur toutes les mutations, y compris les nouvelles actions de transition
      et le `PUT` des réglages.
- [x] **Migration** Prisma : deux migrations `prisma migrate dev` (schéma, puis correction de
      données). Jamais `db push`.
- [x] **Enums** importés depuis `@/generated/prisma/client`.
- [x] **UI** : `Badge`, `Button`, `Modal`, `ConfirmModal`, `Select`, `Input`, `Textarea` existants
      réutilisés. Un seul composant nouveau (la frise d'historique), faute d'équivalent.
- [x] **Surface HTTP** (ADR-0012) : les nouvelles routes tombent sous les préfixes déjà déclarés
      au manifeste (`/integration`, `/api/integration`). Aucun changement de manifeste requis.

## Approche générale

Trois chantiers, dans cet ordre de dépendance :

1. **Extraire la machine à états** du route handler vers le module, en miroir de
   `computeMsdpTransitionData` qui existe déjà dans `msdp-service.ts`. C'est le préalable à tout
   le reste : les deux nouveaux états ajoutent six arcs, impossibles à tester tant que la logique
   vit dans un `switch` de 70 lignes au milieu d'un handler.
2. **Ajouter les deux états d'attente** et le consentement, avec la mémoire du point de reprise.
3. **Brancher relances et historique** sur l'existant : le mécanisme d'inactivité
   (`runInactivityNotifications`) et le journal d'audit sont déjà en place et fournissent
   l'essentiel de la plomberie.

La correction des états incohérents (réouverture, réaffectation) est traitée dans le chantier 1,
puisqu'elle porte sur les mêmes transitions.

## Modèle de données

```prisma
enum FamilyIntegrationStatus {
  SUBMITTED
  WAITING_RECONTACT   // + nouveau : personne à recontacter plus tard
  WAITING_MISSION     // + nouveau : adresse hors zone, en attente du département mission
  ASSIGNED
  CONTACTED
  WHATSAPP_ADDED
  INTEGRATED
  ABANDONED
}

/// Consentement au contact exprimé sur le formulaire d'accueil.
/// Pas de valeur « jamais » : une personne qui refuse ne remplit pas le formulaire,
/// donc aucune demande n'existe (spec §Scénario principal, étape 2).
enum IntegrationContactConsent {
  NOW
  LATER
}

model FamilyIntegrationRequest {
  // … champs existants inchangés

  contactConsent IntegrationContactConsent @default(NOW)

  // Mémoire de l'état d'attente : d'où l'on vient, depuis quand, dernière relance.
  // `waitingFrom` ne vaut que SUBMITTED ou CONTACTED (seuls points d'entrée autorisés).
  waitingFrom   FamilyIntegrationStatus?
  waitingSince  DateTime?
  lastRelanceAt DateTime?
}

/// Réglages du module intégration, par église — même forme que AudioSettings / MediaSettings.
model IntegrationSettings {
  id       String @id @default(cuid())
  churchId String @unique

  recontactDelayDays Int @default(60) // attente de recontact
  missionDelayDays   Int @default(30) // attente de décision du département mission

  church Church @relation(fields: [churchId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("integration_settings")
}
```

**Deux migrations distinctes**, la seconde corrigeant des données :

1. `add_integration_waiting_states` — les deux valeurs d'enum, les quatre colonnes, la table de
   réglages. Purement additive, aucune donnée touchée (`contactConsent` vaut `NOW` par défaut,
   ce qui décrit correctement toutes les demandes existantes).
2. `fix_reopened_requests_status` — corrige l'incohérence héritée : les demandes à l'état
   `SUBMITTED` qui portent pourtant `assignedFamilyId`/`assignedBergerId` (produites par
   l'ancien `reopen`) passent à `ASSIGNED`. On **remonte le statut vers la vérité des données**
   plutôt que d'effacer la famille et le berger : l'affectation est un fait, le statut était le
   mensonge.

## API

| Endpoint | Méthode | Garde | Entrée | Sortie |
|---|---|---|---|---|
| `/api/integration/requests` | POST *(public)* | Turnstile + rate-limit | `+ contactConsent: "NOW" \| "LATER"` | demande créée |
| `/api/integration/requests/[id]` | PATCH | `requireIntegrationAccess` + droits par action | `action: "wait" \| "resume" \| "relance"` (+ actions existantes) | demande à jour |
| `/api/integration/requests/[id]/history` | GET | `requireIntegrationAccess` | — | `{ entries: [{ from, to, action, at, author }] }` |
| `/api/integration/settings` | GET | `requireIntegrationSettingsAccess` | — | `{ recontactDelayDays, missionDelayDays }` |
| `/api/integration/settings` | PUT | `requireIntegrationSettingsAccess` | `{ recontactDelayDays, missionDelayDays }` (`z.number().int().min(1).max(365)`) | réglages à jour |

Les trois nouvelles actions du `PATCH` :

- **`wait`** — `{ action: "wait", waitingKind: "RECONTACT" | "MISSION", note?: string }`.
  Autorisée depuis `SUBMITTED` (équipe intégration seule) et `CONTACTED` (berger assigné **ou**
  équipe). Renseigne `waitingFrom` (statut courant), `waitingSince = now`, remet `lastRelanceAt`
  à `null`.
- **`resume`** — restaure `status = waitingFrom`, efface les trois champs d'attente. Droit calculé
  sur `waitingFrom`, pas sur le statut courant : une attente posée depuis `SUBMITTED` ne peut être
  levée que par l'équipe intégration, même plusieurs mois après.
- **`relance`** — `{ action: "relance", note?: string }`. N'change pas le statut ; pose
  `lastRelanceAt = now`. Refusée si la demande n'est pas dans un état d'attente.

L'action **`abandon`** existante s'ouvre aux deux nouveaux états (elle accepte déjà tout statut
sauf `INTEGRATED`, donc aucun changement de garde). L'action **`reopen`** gagne un paramètre
`mode: "resume" | "restart"` (voir Services).

## Services / logique métier

Tout dans `src/modules/integration/services/`, exporté via l'index du module.

**`family-state.ts`** *(nouveau)* — la machine à états extraite, en miroir de
`computeMsdpTransitionData` :

- `computeFamilyTransitionData(current, action, payload, actor)` — fonction **pure** : reçoit
  l'état courant et le contexte d'acteur (`isIntegrationMember`, `isAssignedBerger`), renvoie le
  `updateData` ou lève `ApiError(400, "Transition invalide")` / `ApiError(403, …)`. Toute la
  table des transitions, anciennes et nouvelles, vit ici et devient testable sans base.
- `assertNoStaleAssignment(data)` — garde l'invariant « `SUBMITTED` ⇒ ni famille ni berger ».
- `computeReopenData(request, mode, history)` — `mode: "resume"` restaure le statut précédant
  l'abandon, lu dans l'historique ; `mode: "restart"` repart à `SUBMITTED` **en détachant**
  famille et berger, et signale le berger à notifier.

**`family-history.ts`** *(nouveau)* — lecture et mise en forme de l'historique depuis le journal
d'audit existant :

- `recordStatusChange({ userId, churchId, requestId, from, to, action })` — encapsule `logAudit`
  avec une forme de `details` documentée `{ action, from, to }`. Remplace l'appel actuel qui ne
  stocke que `{ action }`.
- `getRequestHistory(requestId)` — lit `AuditLog` sur `[entityType: "FamilyIntegrationRequest",
  entityId]` (index déjà présent), joint les auteurs, renvoie la frise ordonnée.

**`family-service.ts`** *(étendu)* — la relance rejoint l'inactivité existante :

- `runWaitingRelanceNotifications(appUrl)`, branché dans `src/app/api/cron/route.ts` à côté de
  `runInactivityNotifications`. Sélectionne, par église, les demandes en attente dont
  `COALESCE(lastRelanceAt, waitingSince) < now - délai de l'état`, et notifie **tous** les membres
  des départements de fonction `INTEGRATION` — en réutilisant tel quel le résolveur `getManagers`
  déjà écrit (qui gère déjà le multi-département de la spec 046).
- `buildRelanceEmail(...)` — sur le modèle de `buildInactivityEmail`, envoi conditionné à
  `SMTP_HOST` comme l'existant.
- `getIntegrationSettings(churchId)` — lecture avec valeurs par défaut si la ligne n'existe pas
  encore (aucun back-fill nécessaire pour les églises existantes).

**`auth.ts`** *(étendu)* — `requireIntegrationSettingsAccess(churchId)` : accès accordé au Super
Admin, à qui détient `members:manage`/`events:manage` (Admin, Secrétaire), ou au titulaire du rôle
`DEPARTMENT_HEAD` sur un département de fonction `INTEGRATION`. Volontairement **plus strict** que
`requireIntegrationAccess`, qui ouvrirait le réglage à tout membre de l'équipe.

## UI / composants

- **Formulaire public** (`src/app/rejoindre/[churchSlug]/JoinForm.tsx`) — un choix
  « Je souhaite être contacté maintenant / Je préfère être recontacté plus tard », en
  `CheckboxGroup`-like radio. Aucun texte n'évoque le troisième cas : une personne qui refuse tout
  contact ne voit pas ce formulaire.
- **Dashboard** (`IntegrationDashboard.tsx`) — deux entrées de filtre de statut supplémentaires,
  un `Badge` « à relancer » sur les demandes dont l'échéance est dépassée (liste toujours à jour
  par requête, indépendante des notifications), et un `Badge` « adresse non rattachée » sur toute
  demande `SUBMITTED` sans `suggestedFamilyId` : c'est ce badge, absent aujourd'hui, qui rend le
  choix manuel du cas « hors zone » praticable — sans lui, rien ne distingue une demande en
  attente normale d'une adresse que le géocodage n'a pas su rattacher.
- **Fiche** (`RequestDetail.tsx`) — trois boutons contextuels (`Mettre en attente`, `Reprendre`,
  `Consigner une relance`) via `Modal` + `ConfirmModal` existants, et une **frise d'historique**
  en bas de fiche : seul composant réellement nouveau, aucun équivalent dans `components/ui/`.
- **Réglages** — page `/integration/parametres` (sous le préfixe déjà déclaré au manifeste), deux
  `Input type="number"` + `Button`, visible seulement si `requireIntegrationSettingsAccess` passe.

## Décisions & alternatives écartées

- **Choix** : extraire la machine à états vers `family-state.ts` — *Pourquoi* : la logique vit
  aujourd'hui dans le `switch` du route handler, ce qui contrevient à la constitution §I
  (« la logique métier vit dans `src/modules/X/services/` »). Le module voisin MSDP a déjà fait
  cette extraction (`computeMsdpTransitionData`) : on s'aligne sur un précédent interne plutôt que
  d'inventer. Sans elle, les six nouveaux arcs ne sont pas testables unitairement.
- **Choix** : deux valeurs d'enum plutôt qu'un axe de suspension orthogonal — *Pourquoi* : la spec
  raisonne en états, l'UI filtre par statut, et le parcours reste linéaire. Un axe orthogonal
  obligerait à réécrire tous les filtres et toutes les requêtes existantes pour un gain nul ici.
- **Écarté** : basculer automatiquement en `WAITING_MISSION` à la soumission quand le géocodage ne
  trouve aucune famille — *Raison* : « le géocodage n'a rien trouvé » ≠ « l'adresse est hors
  zone ». Une adresse mal saisie ou un géocodeur indisponible produiraient de fausses attentes,
  et la spec décrit l'entrée en attente comme une **action** avec des droits explicites. Le POST
  continue donc de renseigner `suggestedFamilyId` ; son absence doit être **rendue visible** dans
  le dashboard (voir UI / composants — rien n'existe aujourd'hui pour ce cas : `suggestedFamilyName`
  ne s'affiche que sur la fiche, et seulement quand une suggestion existe). L'équipe décide
  elle-même de poser l'attente via l'action `wait`. **Confirmé** : choix manuel, pas d'automatisme.
- **Choix** : historique adossé au journal d'audit existant, avec `details` enrichi de
  `{ from, to }` — *Pourquoi* : la table est déjà écrite à chaque `PATCH`, déjà indexée sur
  `[entityType, entityId]`, et la décision de rétention actée dans la spec (pas de purge alignée
  sur l'archivage) correspond exactement au comportement actuel du journal. Une table dédiée
  créerait une seconde source de vérité sur les mêmes événements.
- **Écarté** : table `FamilyIntegrationStatusChange` dédiée — *Raison* : duplication de ce que le
  journal d'audit enregistre déjà ; son seul avantage (rétention propre) est annulé par la
  décision de rétention actée.
- **Choix** : `waitingSince` dédié plutôt que `updatedAt` — *Pourquoi* : `updatedAt` bouge à
  chaque note ou correction de fiche, ce qui repousserait indéfiniment l'échéance de relance. Le
  mécanisme d'inactivité existant souffre déjà de ce défaut ; on ne le reproduit pas.
- **Choix** : `lastRelanceAt` comme base du décompte — *Pourquoi* : implémente directement
  « consigner une relance remet le décompte à zéro ». Le dédoublonnage actuel par ancienneté de
  notification ne sait pas faire cette distinction.
- **Choix** : visibilité permanente par requête, notification ponctuelle par cycle —
  *Pourquoi* : la spec demande que l'alerte « ne disparaisse pas d'elle-même », mais créer une
  notification à chaque passage du cron noierait l'équipe. La liste « à relancer » est donc
  toujours exacte, et la notification suit le dédoublonnage existant.
- **Choix** : helper `requireIntegrationSettingsAccess` plutôt qu'une permission au manifeste —
  *Pourquoi* : le module ne déclare aucune permission et fonctionne entièrement par helpers ;
  ajouter une permission pour ce seul réglage imposerait de toucher la matrice de
  `rolePermissions`, `permissions.test.ts` et le tableau de `CLAUDE.md` pour un cas isolé.
  ADR-0010 recommande explicitement le helper dédié au module.
- **Choix** : migration corrective qui promeut les demandes incohérentes en `ASSIGNED` —
  *Pourquoi* : effacer la famille et le berger détruirait une information vraie pour préserver un
  statut faux. Le berger concerné existe et se croit en charge : c'est le statut qu'il faut aligner.

## Risques & points d'attention

- **Ambiguïté résiduelle de la spec** sur l'automatisme du basculement en `WAITING_MISSION` (voir
  Décisions). À trancher avant implémentation — c'est le seul point qui peut changer le périmètre.
- **Migration corrective** : le volume de demandes rouvertes incohérentes est inconnu. Compter
  avant d'appliquer, et journaliser les identifiants corrigés.
- **Droits calculés sur `waitingFrom`** : une attente posée depuis `CONTACTED` reste levable par
  le berger assigné, même si celui-ci a changé entre-temps. Comportement voulu, mais contre-intuitif
  — à couvrir par un test explicite.
- **Cron non transactionnel** : `runWaitingRelanceNotifications` boucle église par église comme
  l'existant. Un échec en cours de route laisse des notifications partiellement envoyées ; le
  dédoublonnage évite les doublons au passage suivant.
- **Le formulaire public gagne un champ obligatoire** : toute intégration tierce qui POSTerait
  déjà sur cette route sans `contactConsent` continue de fonctionner grâce au défaut `NOW`, mais
  l'ajout doit rester `.default("NOW")` côté Zod pour ne pas casser l'existant.
- **Aucun impact sur #580** : les demandes de soin pastoral (`AppointmentRequest`) créées par ce
  même POST ne sont pas touchées ; les deux chantiers restent disjoints.

## Stratégie de tests

Unitaires Vitest, sans base, en ciblant les fonctions pures extraites :

- **`computeFamilyTransitionData`** — la table complète des arcs : les six nouveaux (entrée depuis
  `SUBMITTED` et `CONTACTED`, reprise vers chacun, abandon depuis chaque attente), le refus de
  toute entrée depuis un autre état, et le refus d'un berger sur une entrée depuis `SUBMITTED`.
- **`computeReopenData`** — `resume` restaure bien le statut d'avant l'abandon lu dans
  l'historique ; `restart` détache famille et berger et signale le berger à notifier.
- **`assertNoStaleAssignment`** — l'invariant rejette une donnée `SUBMITTED` portant une famille.
- **Sélection des relances** — fonction pure de calcul d'échéance : `lastRelanceAt` prime sur
  `waitingSince` ; chaque état utilise son propre délai ; une demande hors attente n'est jamais
  sélectionnée ; une demande dont la relance vient d'être consignée sort de la sélection.
- **`requireIntegrationSettingsAccess`** — Admin et Secrétaire passent, responsable du département
  intégration passe, membre simple de l'équipe est refusé, berger est refusé.
- **`getRequestHistory`** — reconstitue plusieurs cycles attente → reprise → attente sans qu'aucun
  n'écrase le précédent.

Pas de test d'intégration base requis : les routes se contentent d'appeler ces fonctions, et le
reste de la plomberie (audit, notifications, cron) est déjà couvert par les tests existants.
