# Plan technique — Formulaires (inscriptions, participation, sondages)

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-11-12
- **ADR** : [ADR-0030](../../docs/adr/0030-moteur-de-formulaires.md) (moteur de formulaires et
  anonymat des sondages, Accepté)

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : nouveau module `forms`, exposé par `@/modules/forms` (index),
  `@/modules/forms/auth` (gardes) et `@/modules/forms/schemas` (schémas purs). `forms` n'importe
  ni `planning` ni `ticketing` : le lien à un événement est une colonne, posée et validée par
  `src/app` (ADR-0027).
- [x] **Sécurité** : routes de gestion derrière `requireChurchPermission("forms:manage", churchId)`
  avec l'église **du formulaire** (`resolveChurchId("form", id)`) ; intervenants vérifiés objet
  par objet (`requireFormAccess`) ; routes publiques sous `routes.public` avec Turnstile et
  limite de débit ; formulaires « comptes connectés » vérifiés par appartenance à l'église.
- [x] **Permissions** via `rolePermissions` : `forms:manage` (Super Admin, Admin, Secrétaire)
  déclarée dans le manifeste, matrice de `permissions.test.ts`, `CLAUDE.md` et `docs/auth.md`
  mis à jour dans le même commit.
- [x] **Validation** Zod : corps de gestion dans les `contract.ts` ; réponses validées par un
  schéma **dérivé des questions du formulaire** (`buildAnswerSchema`).
- [x] **Migration** Prisma par lot (`prisma migrate dev`).
- [x] **Enums** depuis `@/generated/prisma/client` (`FormKind`, `FormStatus`, `FormQuestionType`…).
- [x] **UI** : `Field`, `Button`, `Modal`/`ConfirmModal`, `DataTable`, `Tabs`, `StatusChip`,
  `EmptyState`, `Toast`, `PageHeader` ; graphiques avec `recharts` (déjà en dépendance).

## Approche générale

Un module **`forms`** porte un **moteur générique** : un formulaire est une liste de questions
typées (13 types) stockées en lignes, les réponses sont stockées par question en JSON et validées
côté serveur par un schéma Zod construit à partir des questions (affichage conditionnel compris).
Au-dessus du moteur, trois usages : **inscription** (sessions, niveaux, places, liste d'attente,
présence), **participation** (rattachée à un événement d'église ou de billetterie) et
**sondage** (anonyme ou nominatif, résultats regroupés).

On reprend les mécanismes éprouvés de la billetterie (spec 074) sans en dépendre : verrou de ligne
pour les places, jetons dérivés dont seule l'empreinte est stockée, Turnstile et limite de débit,
tâche cron, purge après conservation avec totaux conservés.

**Livraison en trois lots** (une PR par lot, sur la branche de la session) :
1. **Construction et réponses** : modèle, constructeur, 13 types, conditionnel, diffusion
   publique / comptes connectés, états et dates, accusé et gestion de sa réponse, doublons,
   liste et export, notifications, journal, conservation et purge.
2. **Inscriptions PCNC** : sessions et niveaux, places sur les niveaux et les choix, liste
   d'attente avec proposition à confirmer, intervenants et périmètre, feuille de présence.
3. **Sondages et participation** : anonymat, résultats regroupés et graphiques, rattachement à
   un événement d'église ou de billetterie.

## Modèle de données

Migration par lot. Esquisse (noms définitifs à l'implémentation) :

```prisma
enum FormKind { REGISTRATION PARTICIPATION SURVEY }
enum FormAccess { PUBLIC MEMBERS }
enum FormStatus { DRAFT PUBLISHED CLOSED }
enum FormQuestionType {
  SHORT_TEXT LONG_TEXT SINGLE_CHOICE MULTIPLE_CHOICE DROPDOWN YES_NO NUMBER
  DATE EMAIL PHONE RATING CONSENT SESSION_LEVEL
}
enum FormResponseStatus { CONFIRMED WAITLISTED OFFERED CANCELLED DECLINED EXPIRED }
enum FormHalfDay { AM PM }

model Form {
  id                String     @id @default(cuid())
  churchId          String
  slug              String     @db.VarChar(80)        // adresse publique, unique par église
  title             String     @db.VarChar(150)
  description       String?    @db.Text
  kind              FormKind
  access            FormAccess
  anonymous         Boolean    @default(false)        // sondages seulement, figé dès la 1re réponse
  status            FormStatus @default(DRAFT)
  opensAt           DateTime?                         // ouverture automatique
  closesAt          DateTime?                         // fin des réponses
  maxResponses      Int?
  waitlistEnabled   Boolean    @default(false)
  offerHoldHours    Int        @default(48)
  retentionMonths   Int        @default(12)           // 1 à 24
  eventId           String?                           // événement d'église (lot 3)
  ticketingEventId  String?                           // événement de billetterie (lot 3)
  contactQuestionId String?                           // question email servant d'adresse de contact
  closedAt          DateTime?
  purgedAt          DateTime?
  deletedAt         DateTime?
  totals            Json?                             // totaux conservés après purge
  notifiedUpTo      DateTime?                         // dernière réponse signalée au secrétariat
  createdById       String
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  @@unique([churchId, slug])
  @@map("forms")
}

model FormQuestion {           // position, type, libellé, aide, obligatoire
  id, formId, position Int, type FormQuestionType, label, help?, required Boolean,
  config Json?                 // { min, max } pour NUMBER, texte du consentement…
  conditionQuestionId String?  // affichage conditionnel : une seule question précédente
  conditionValue      String?  // valeur attendue (id de choix, "true"/"false")
  @@map("form_questions")
}

model FormChoice { id, questionId, position Int, label, capacity Int? @@map("form_choices") }

model FormSession { id, formId, position Int, label, startDate DateTime @db.Date, days Int /* 1|2 */ }
model FormLevel   { id, sessionId, position Int, code String /* "001" */, label, capacity Int, isEntry Boolean }

model FormResponse {
  id, formId, churchId,
  status            FormResponseStatus @default(CONFIRMED)
  userId            String?            // compte connecté (jamais pour un sondage anonyme)
  contactEmail      String?            // public nominatif ; normalisé
  contactKey        String?            // empreinte de l'email normalisé, pour les doublons
  sessionId         String?
  levelId           String?
  previousLevelDone Boolean?           // indicatif, null pour le niveau d'entrée
  waitingOn         String?            // niveau ou choix attendu en liste d'attente
  offerExpiresAt    DateTime?
  manageSalt        String?            // jeton de gestion dérivé, empreinte seule stockée
  manageHash        String?  @unique
  submittedOn       DateTime @db.Date  // jour seulement (anonymat : pas d'horodatage fin)
  createdAt, updatedAt, cancelledAt?
  @@index([formId, status])
  @@map("form_responses")
}

model FormAnswer         { id, responseId, questionId, value Json  @@unique([responseId, questionId]) }
model FormResponseChoice { responseId, choiceId  @@id([responseId, choiceId]) }  // décompte des places par choix

/// Sondage anonyme réservé aux comptes : « ce compte a déjà répondu », SANS lien vers la réponse.
model FormAnonymousReceipt { formId, keyHash String /* HMAC(formId:userId) */  @@id([formId, keyHash]) }

model FormFacilitator      { id, formId, userId, allScope Boolean  @@unique([formId, userId]) }
model FormFacilitatorScope { facilitatorId, sessionId, levelId String?  @@unique([facilitatorId, sessionId, levelId]) }

model FormAttendance {
  responseId, day Int /* 1|2 */, half FormHalfDay, present Boolean,
  updatedById String, updatedAt DateTime @updatedAt
  @@id([responseId, day, half])
}
```

Lot 1 : `Form`, `FormQuestion`, `FormChoice`, `FormResponse`, `FormAnswer`, `FormResponseChoice`,
`FormAnonymousReceipt`. Lot 2 : sessions, niveaux, intervenants, présence. Lot 3 : colonnes
`eventId` / `ticketingEventId` (si elles ne sont pas posées au lot 1).

Toutes les tables enfants sont en `onDelete: Cascade` depuis `Form`/`FormResponse`, ce qui rend
la purge et la suppression atomiques.

## API

Préfixes déclarés dans le manifeste `forms` (ADR-0012) : `authenticated: /formulaires`,
`api: /api/forms`, `public: /f`, `/api/forms/public`. Chaque route a son `contract.ts`.

| Endpoint | Méthode | Accès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/forms` | GET, POST | `forms:manage` (église courante) | `formCreateSchema` | liste / formulaire |
| `/api/forms/[id]` | GET, PATCH, DELETE | `forms:manage` (église du formulaire) | `formUpdateSchema` (questions, choix, sessions, niveaux, réglages) | formulaire |
| `/api/forms/[id]/status` | POST | `forms:manage` | `{ action: publish \| close \| reopen }` | formulaire |
| `/api/forms/[id]/duplicate` | POST | `forms:manage` | `{ title? }` | nouveau brouillon |
| `/api/forms/[id]/responses` | GET | `forms:manage` ou intervenant (son périmètre) | filtres session, niveau, statut | réponses |
| `/api/forms/[id]/responses/[rid]` | PATCH | `forms:manage` | `{ status? }` (annuler, confirmer une attente) | réponse |
| `/api/forms/[id]/export` | GET | `forms:manage` (jamais l'intervenant) | — | `.xlsx` (journalisé) |
| `/api/forms/[id]/results` | GET | `forms:manage` ou intervenant | — | résultats regroupés (lot 3) |
| `/api/forms/[id]/facilitators` | GET, PUT | `forms:manage` | `{ userId, allScope, scopes[] }[]` | intervenants (lot 2) |
| `/api/forms/[id]/attendance` | GET, PUT | `forms:manage` ou intervenant (périmètre) | `{ responseId, day, half, present }[]` | feuille (lot 2) |
| `/api/forms/public/[churchSlug]/[formSlug]` | GET | public ou membre selon `access` | — | formulaire à remplir, places restantes |
| `/api/forms/public/[churchSlug]/[formSlug]/responses` | POST | idem, Turnstile si public | `answers`, `turnstileToken?` | `{ status, manageToken? }` |
| `/api/forms/public/responses/[token]` | GET, PATCH, DELETE | jeton de gestion | réponses modifiées | réponse |
| `/api/forms/public/responses/[token]/offer` | POST | jeton | `{ accept: boolean }` | réponse (lot 2) |
| `/api/forms/mine/[formId]` | GET, PATCH, DELETE | compte connecté, sa propre réponse | réponses modifiées | réponse |

Règles communes :
- Formulaire brouillon, fermé, supprimé, inexistant ou d'une autre église : **même 404**
  « Formulaire non disponible » (une seule fonction `loadAnswerableForm`).
- Formulaire `MEMBERS` : session obligatoire **et** rôle dans l'église du formulaire ; sinon le
  même 404 (une personne d'une autre église ne le voit pas).
- Public : `requireRateLimit` (consultation 60/min, envoi 5/min par IP) et `verifyTurnstile`.

## Services / logique métier

`src/modules/forms/services/` :

- **`engine.ts`** (moteur, réutilisable) : `buildAnswerSchema(questions)` — un schéma Zod par
  type (bornes du nombre, format email/téléphone/date, note 1 à 5, consentement obligatoirement
  vrai, choix dans la liste) ; `visibleQuestions(questions, answers)` applique l'affichage
  conditionnel (une question masquée est ignorée : ni requise ni enregistrée).
- **`builder.ts`** : création, mise à jour, duplication ; `assertSafeEdit(before, after,
  counts)` refuse, dès qu'il y a des réponses, de supprimer une question répondue, de baisser une
  place sous le nombre d'inscrits, de changer l'anonymat ; slug unique par église.
- **`lifecycle.ts`** : publier, fermer, rouvrir, supprimer (réponses effacées tout de suite,
  formulaire gardé en `deletedAt` pour le journal et le 404 uniforme).
- **`responses.ts`** : `submitResponse` dans **une transaction** qui verrouille la ligne du
  formulaire (mise à jour, comme `lockEvent` de la billetterie), vérifie ouverture, nombre
  maximal, doublon, places restantes (réponses `CONFIRMED` + `OFFERED`), puis écrit ; place pleine
  ⇒ `WAITLISTED` si la liste d'attente est active, sinon 409 « complet ». Doublon : même compte ou
  même `contactKey` parmi les réponses non annulées ⇒ 409 ; pour un formulaire public, le lien de
  gestion est **renvoyé par email** à l'adresse (jamais affiché à qui l'a saisie).
- **`tokens.ts`** : jeton de gestion dérivé (HMAC de `FORMS_TOKEN_SECRET`, à défaut
  `AUTH_SECRET`), empreinte SHA-256 seule en base — même principe que la billetterie.
- **`waitlist.ts`** (lot 2) : `offerNextPlace(tx, formId, slot)` à chaque place libérée
  (annulation, déclin, expiration, capacité augmentée) : la première réponse en attente passe en
  `OFFERED` avec `offerExpiresAt = now + offerHoldHours` ; acceptation ⇒ `CONFIRMED` ; déclin ou
  expiration ⇒ `DECLINED`/`EXPIRED` puis proposition suivante.
- **`attendance.ts`** (lot 2) : feuille par session (jours × matin/après-midi), écriture case par
  case (la dernière saisie l'emporte), `logAudit` par changement (qui a coché quoi).
- **`access.ts`** + `auth.ts` : `getFormAccess(session, form)` ⇒ `manage` | `facilitator`
  (avec sessions/niveaux) | aucun ; un intervenant n'a plus d'accès une fois le formulaire
  **clôturé** ou son entrée retirée.
- **`results.ts`** (lot 3) : agrégats par question (effectifs, pourcentages, moyenne des notes,
  textes libres) ; jamais d'identité pour un sondage anonyme.
- **`exports.ts`** : classeur `exceljs` passé par `sanitizeRow` (`src/lib/excel.ts`) — une ligne
  par réponse, colonnes des questions, session, niveau, « niveau précédent suivi », présences.
- **`notify.ts`** : accusé de réception (email direct si pas de compte — liste blanche
  `sendEmail` ; sinon `createNotification`, domaine `forms`) ; signal au secrétariat **regroupé**
  par la tâche cron (« 3 nouvelles réponses à PCNC — novembre »), jamais de nom dans le texte.
- **`tasks.ts`** : `runFormTasks()` branchée sur `/api/cron` (`forms`, intervalle 15 min,
  gardée par `registry.has("forms")`) : ouverture / fin des réponses aux dates, propositions
  expirées, signal des nouvelles réponses ; purge quotidienne (`forms-purge`, 3 h) : calcul des
  `totals`, suppression des réponses (cascade : réponses, choix, présences, reçus anonymes) et
  des intervenants, `purgedAt`.

Notification : domaine **`forms`** (« Formulaires »), `defaultEmail: true`,
`visibleWith: ["forms:manage"]` pour les signaux ; les répondants avec compte le voient par
rattachement historique.

## UI / composants

- **`/formulaires`** (`forms:manage`, ou intervenant pour ses formulaires) : liste avec état,
  réponses / places, actions (dupliquer, fermer). Entrée dans l'espace « Agenda » de
  `navigation.ts`, à côté de « Billetterie ».
- **`/formulaires/[id]`** à onglets (`Tabs`) : **Construction** (questions réordonnables par
  boutons haut/bas, choix et places, condition d'affichage, sessions et niveaux), **Réglages**
  (accès, dates, liste d'attente, délai, conservation, intervenants), **Aperçu**, **Réponses**
  (`DataTable`, filtres session/niveau/statut, export), **Présence** (lot 2), **Résultats**
  (lot 3, `recharts`).
- **`/f/[churchSlug]/[formSlug]`** : page de réponse, publique ou après connexion, mobile
  d'abord ; places restantes et niveau complet affichés ; « niveau précédent suivi » demandé hors
  niveau d'entrée ; widget Turnstile si public. **`/f/reponse/[token]`** : modifier, annuler,
  accepter ou décliner une place proposée.
- **« Mes formulaires »** : pour un compte connecté, retrouver ses réponses ouvertes (dans
  « Mon profil » ou l'Accueil).
- Page d'événement (`/events/[eventId]`) et page de l'événement de billetterie : bloc
  « Formulaires » avec les formulaires publiés rattachés (lot 3) ; `src/app` appelle
  `listFormsForEvent` de `@/modules/forms`.

## Décisions & alternatives écartées

- **Choix** : questions en lignes, réponses en JSON par question validées par un schéma dérivé —
  *Pourquoi* : ajouter un type ne demande aucune migration, la validation reste côté serveur,
  les places se comptent en SQL grâce à `FormResponseChoice`. Voir ADR-0030.
- **Choix** : anonymat par **séparation** — la réponse anonyme ne porte ni compte, ni email, ni
  IP, ni horodatage fin (`submittedOn` au jour) ; l'unicité par compte passe par
  `FormAnonymousReceipt` (empreinte HMAC, sans lien vers la réponse ni date) — *Pourquoi* : le
  lien compte ↔ réponse n'existe nulle part en base, donc ne peut fuiter ni par l'écran ni par
  un export ni par une requête d'administration.
- **Choix** : places = verrou de la ligne `Form` dans la transaction puis comptage —
  *Pourquoi* : même garantie que la billetterie contre deux réponses simultanées, sans compteur
  stocké qui pourrait dériver.
- **Choix** : une place proposée compte comme prise jusqu'à acceptation ou expiration —
  *Pourquoi* : sinon une nouvelle inscription pourrait prendre la place proposée.
- **Choix** : distinguer **fin des réponses** (`closesAt`, le formulaire reste publié et
  consultable par les intervenants) et **clôture** (`status = CLOSED`, manuelle, ou automatique
  le lendemain de la dernière session pour une inscription) — *Pourquoi* : dans la spec, les
  inscriptions PCNC ferment avant la formation, alors que les formateurs doivent noter la
  présence le jour J ; leur accès s'éteint à la **clôture**, et la conservation court à partir
  d'elle. Validé le 2026-11-12.
- **Choix** : conservation **12 mois par défaut, 24 mois au plus**, à compter de la clôture
  (tranche le point laissé ouvert par la spec).
- **Choix** : doublon sur un formulaire public ⇒ le lien de gestion est renvoyé à l'adresse
  email au lieu d'être affiché — *Pourquoi* : sinon quiconque connaît l'email d'un inscrit
  obtiendrait son lien.
- **Choix** : signal au secrétariat regroupé toutes les 15 minutes — *Pourquoi* : une session
  PCNC de 100 inscrits produirait 100 notifications ; le texte ne contient aucun nom (règle des
  écrans verrouillés, spec 068).
- **Choix** : réordonnancement par boutons haut/bas — *Écarté* : glisser-déposer (nouvelle
  dépendance, accessibilité à reprendre).
- **Écarté** : SurveyJS, Form.io — *Raison* : décision de la spec (construit dans Koinonia).
- **Écarté** : réutiliser les questions de la billetterie ou de `/servir` — *Raison* : hors
  périmètre ; le moteur est conçu pour pouvoir les servir plus tard (ADR-0030).
- **Écarté** : partager `tokens.ts` de la billetterie — *Raison* : interne au module
  `ticketing` ; `forms` a sa propre petite fonction (même principe, autre secret de domaine),
  l'extraction commune dans `src/lib` pourra venir si un troisième usage apparaît.

## Risques & points d'attention

- **Anonymat** : à tester explicitement (aucun `userId`, email, IP ni heure ; reçus sans lien ;
  export et résultats sans identité). Les journaux d'audit ne doivent rien contenir d'une
  réponse anonyme (pas de `logAudit` à l'envoi d'un sondage anonyme).
- **Concurrence** sur les dernières places et sur la liste d'attente (expiration et annulation
  simultanées) : tout passe par la transaction verrouillée.
- **Données personnelles** : purge effective et totaux conservés ; jeton de gestion jamais
  stocké en clair ; accusé sans données sensibles.
- **Modification d'un formulaire qui a des réponses** : `assertSafeEdit` est la seule porte ;
  les réponses existantes restent lisibles même si une condition change.
- **Turnstile** fail-closed : sans clés, un formulaire public annonce « indisponible ».
- **Volume** : un formulaire = une ligne verrouillée ; acceptable pour les volumes d'une église.
- **Surface HTTP** : préfixes `/f` et `/formulaires` à vérifier contre `route-exhaustiveness`.

## Stratégie de tests

Vitest, `prismaMock`, comme les autres modules :
- **Moteur** : schéma dérivé pour chacun des 13 types (valides / invalides), obligatoire,
  conditionnel (masquée ⇒ ignorée), consentement.
- **Construction** : `assertSafeEdit` (question répondue, places sous les inscrits, anonymat
  figé), slug unique, duplication.
- **Réponses** : ouverture et fermeture par dates et par nombre, 404 uniforme pour chaque cause,
  `MEMBERS` hors église refusé, doublon (compte, email), dernière place prise par une seule
  réponse (deux transactions simulées), liste d'attente.
- **Liste d'attente** : proposition, acceptation, déclin, expiration ⇒ suivante, place proposée
  comptée comme prise.
- **Accès** : `forms:manage` limité à son église, intervenant borné à ses sessions/niveaux, sans
  export, accès éteint à la clôture ou au retrait.
- **Présence** : jours × demi-journées, dernière saisie gagnante, journal.
- **Anonymat** : aucune identité enregistrée ni exposée, un seul envoi par compte.
- **Purge** : totaux calculés puis réponses effacées, à la bonne date (12 mois, 24 au plus).
- **Routes** : `contract.ts` de chaque route, `npm run openapi`, matrice des permissions,
  `route-exhaustiveness`, `rbac-no-role-proxy`.

## Écarts à l'implémentation (lot 1)

- **Clôture à la fin des réponses** pour tous les formulaires au lot 1 (tâche `forms`) ; le lot 2
  exclura les inscriptions à sessions, clôturées le lendemain de la dernière session.
- **Horodatage posé par le code** : `form_responses.createdAt` sans valeur par défaut (jour seul
  pour un sondage anonyme), `modifiedAt` au lieu de `updatedAt`, identifiants UUID v4 pour les
  réponses et valeurs anonymes (un cuid encode l'heure). `forms.notifiedCount` (compteur pris de
  façon atomique) remplace `notifiedUpTo`, inutilisable avec des dates au jour.
- **Liste d'attente** : le service sait mettre une réponse en attente sur un choix complet, mais le
  réglage n'est pas proposé dans l'interface avant le lot 2 (places proposées à confirmer).
- **Destinataire du signal** : l'auteur du formulaire, à défaut les Admins et Secrétaires de
  l'église.
- **« Mes réponses »** : `/formulaires/mes-reponses` (les sondages anonymes n'y figurent pas).
- **`/formulaires`** : réservé à `forms:manage` au lot 1 ; les intervenants arrivent au lot 2.
- **Question Email ajoutée d'office** (retour de recette) : un formulaire public nominatif reçoit
  automatiquement une question Email obligatoire en tête (`ensureContactQuestion`, à la création,
  à chaque modification et à la publication), verrouillée dans le constructeur, au lieu d'une
  publication refusée.
- **« Retrouver ma réponse »** (retour de recette) : sur la page publique, l'adresse saisie reçoit
  le lien de gestion de sa réponse active (`POST …/recover`, Turnstile, 3/min/IP), même réponse
  que l'adresse soit connue ou non — sur le modèle de « Retrouver ma réservation ».
