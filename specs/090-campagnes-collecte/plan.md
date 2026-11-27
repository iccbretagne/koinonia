# Plan — 090 Campagnes de collecte

- **Statut** : En cours
- **ADR** : [ADR-0032](../../docs/adr/0032-campagnes-de-collecte.md) (module distinct de `forms`,
  définition JSON versionnée, réponses par code)

## Conformité constitution

- [ ] Migration Prisma (`prisma migrate dev --name campaigns`), jamais `db push`
- [ ] Module `src/modules/campaigns` (dépend de `core` seulement ; n'importe aucun autre module)
- [ ] `src/app` n'importe que `@/modules/campaigns`, `@/modules/campaigns/auth`, `@/modules/campaigns/schemas`
- [ ] Toute route API : `contract.ts` voisin (ADR-0023), `npm run openapi`, déclarée dans `routes` du manifeste
- [ ] Permission `campaigns:manage` (SUPER_ADMIN, ADMIN) : matrice `src/core/__tests__/permissions.test.ts`,
      tableau de `CLAUDE.md`, `docs/auth.md` dans le même commit
- [ ] UI : composants `src/components/ui`, tokens sémantiques, mobile d'abord

## Données (Prisma)

```prisma
enum CampaignStatus { DRAFT OPEN CLOSED }
enum CampaignAssignmentStatus { NOT_STARTED IN_PROGRESS SUBMITTED CHANGES_REQUESTED VALIDATED }
enum CampaignQualifier { EXACT ESTIMATE TO_RESEARCH NOT_APPLICABLE NSP }

model Campaign {            // @@map("campaigns")
  id, churchId, key VarChar(80)            // @@unique([churchId, key]) — idempotence de l'import
  title VarChar(150), description Text?, periodStart Date?, periodEnd Date?, dueAt DateTime?
  status CampaignStatus @default(DRAFT)
  fileRetentionDays Int @default(30)
  rules Json?                               // règles déclaratives (voir plus bas)
  definitionHash VarChar(64)                // empreinte de la dernière définition importée
  openedAt, closedAt, filesPurgedAt DateTime?
  createdById String? (User, SetNull), createdAt, updatedAt
}
model CampaignManager {     // @@map("campaign_managers") @@id([campaignId, userId])
  campaignId (Cascade), userId (User Cascade), addedById String? (SetNull), createdAt
}
model CampaignForm {        // @@map("campaign_forms") @@unique([campaignId, key])
  id, campaignId (Cascade), key VarChar(80), title VarChar(150), position Int
  confidential Boolean @default(false)
  definition Json           // { intro?, sections: [...] } (voir « Définition »)
  definitionHash VarChar(64), revision Int @default(1), updatedAt
}
model CampaignAssignment {  // @@map("campaign_assignments") @@unique([formId, key])
  id, formId (Cascade), campaignId (dénormalisé, Cascade), churchId (dénormalisé)
  key VarChar(80), label VarChar(150), position Int, dueAt DateTime?
  status CampaignAssignmentStatus @default(NOT_STARTED)
  startedAt, submittedAt DateTime?, submittedById String?, submittedByName VarChar(150)?
  reviewReason Text?, reviewedAt DateTime?, reviewedById String?
  validatedAt DateTime?, validatedById String?, pastoralValidated Boolean @default(false)
  lastRemindedAt DateTime?, dueReminderSentAt DateTime?
  definitionRevision Int?   // révision du questionnaire au moment de la soumission
  @@index([campaignId, status])
}
model CampaignRespondent {  // @@map("campaign_respondents")
  id, assignmentId (Cascade)
  userId String? (User Cascade)             // compte de l'église (cas normal)
  name VarChar(150)?, email VarChar(254)?   // sans compte (exception)
  tokenSalt VarChar(32)?, tokenHash VarChar(64)? @unique   // lien personnel dérivé (HMAC)
  addedById String?, createdAt
  @@unique([assignmentId, userId])  @@index([userId])
}
model CampaignAnswer {      // @@map("campaign_answers") @@unique([assignmentId, code])
  id, assignmentId (Cascade), code VarChar(40)
  value Json?, qualifier CampaignQualifier @default(EXACT), note VarChar(1000)?
  updatedById String?, updatedByName VarChar(150)?, updatedAt
}
model CampaignFile {        // @@map("campaign_files")
  id, assignmentId (Cascade), campaignId, churchId, requestCode VarChar(40)
  storageKey VarChar(300), name VarChar(200), mime VarChar(100), size Int, sha256 VarChar(64)
  uploadedById String?, uploadedByName VarChar(150)?, uploadedAt
  @@index([assignmentId, requestCode]) @@index([campaignId])
}
```

Relations inverses à ajouter sur `Church` et `User`. Pas d'historique de fichiers remplacés : un
remplacement supprime l'ancien objet du stockage (journalisé).

## Définition (format d'import, `version: 1`)

```jsonc
{
  "format": "koinonia.campaign", "version": 1,
  "campaign": { "key": "f9-2026", "title": "…", "description": "…",
                "periodStart": "2026-01-01", "periodEnd": "2026-11-30", "dueAt": "2026-12-04",
                "fileRetentionDays": 30 },
  "forms": [{
    "key": "integration", "title": "Intégration", "confidential": false, "intro": "…",
    "assignments": [{ "key": "integration", "label": "Intégration", "dueAt": "2026-12-04",
                      "respondents": ["prenom.nom@exemple.org"] }],
    "sections": [{ "key": "accueil", "title": "Accueil des nouveaux", "intro": "…",
      "items": [{ "code": "V1", "type": "integer", "label": "…", "help": "…", "examples": "…",
                  "required": true, "qualifiers": ["ESTIMATE", "TO_RESEARCH"], "min": 0 }] }]
  }],
  "rules": [{ "key": "evangelisation-entonnoir", "message": "…", "check": { "chain_gte": ["E3","E4","E5","E6"] } }]
}
```

- **Codes** : `^[A-Za-z][A-Za-z0-9_]{0,39}$`, uniques dans **toute la campagne** (les règles s'y
  réfèrent), y compris les sous-champs de groupe (`D6_NOM`). `reportCode` facultatif (code de
  restitution, défaut = `code`) ; `internal: true` marque un code hors F9 (ex. `M0_C`).
- **Types** et valeurs JSON stockées (`CampaignAnswer.value`) :

  | type | options | valeur |
  |---|---|---|
  | `integer` | `min`, `max` | nombre entier |
  | `decimal` | `min`, `max`, `decimals` (≤ 4), `unit` (ex. `"%"`) | nombre |
  | `text` / `longtext` | `maxLength` (300 / 5000 par défaut) | chaîne |
  | `yesno` | — | booléen |
  | `single` | `choices: [{key,label}]` | clé |
  | `multiple` | `choices: [{key,label,exclusive?}]` | clés (un choix `exclusive` est seul) |
  | `date` | — | `"AAAA-MM-JJ"` |
  | `group` | `fields: [item scalaire]`, `minRows`, `maxRows` (≤ 50), `noneLabel` | `{ none: true }` ou `{ rows: [{ <code champ>: valeur }] }` |
  | `file_request` | `accept` (`xlsx`,`csv`,`pdf`), `maxFiles` (≤ 10) | `{ status: "CROSS_FIGURE" \| "FILE_SENT" \| "TO_RESEARCH" \| "NOT_NEEDED" }` |

- **Qualificatifs** (`qualifiers`, défaut `["ESTIMATE","TO_RESEARCH"]`, `EXACT` toujours permis ;
  pas de qualificatif pour `file_request` et `group`) : `ESTIMATE` ⇒ valeur **et** note ;
  `TO_RESEARCH` ⇒ note, valeur facultative ; `NOT_APPLICABLE` / `NSP` ⇒ valeur nulle.
- **Complétude** (soumission) : chaque item `required` a une valeur valide, ou un qualificatif
  `TO_RESEARCH`/`NOT_APPLICABLE`/`NSP` ; `file_request` requis ⇒ un état ; `FILE_SENT` ⇒ ≥ 1
  fichier. Zéro est une valeur ; vide n'est jamais converti.
- **Règles** (arbre JSON, pas de texte à analyser) — opérande : chaîne = code, nombre, booléen,
  `{ "sum": [opérandes] }` ; contrôle : `{ "lte"|"lt"|"gte"|"gt"|"eq"|"neq": [a, b] }`,
  `{ "chain_gte": [codes] }`, `{ "chain_lte": [codes] }`, `{ "implies": [contrôle, contrôle] }`,
  `{ "all": [contrôles] }`. Résultat `ok | violated | skipped` (`skipped` dès qu'une valeur manque
  ou n'est pas exploitable : qualificatif `NOT_APPLICABLE`/`NSP`, ou type non numérique/booléen ;
  dans `implies`, prémisse `skipped`/fausse ⇒ `ok`/`skipped`). Une règle dont tous les codes sont
  dans le même questionnaire est **locale** (alerte pendant la saisie) ; sinon **croisée**
  (onglet Contrôles du pilotage). Jamais bloquante.

## Import (création / mise à jour)

`importCampaign(churchId, definition, { dryRun, actor })` → `ImportPreview` :
`{ campaign: { action: "create"|"update"|"unchanged", key, title },
   forms: [{ key, title, action, revision, itemsAdded, itemsChanged, itemsRemoved }],
   assignments: [{ formKey, key, label, action }],
   respondents: { resolved: [{ email, name }], unresolved: [emails] },
   blocked: [{ formKey?, code?, reason }], definitionHash }`.

- Validation : Zod (`campaignDefinitionSchema`) puis sémantique (`validateDefinition` : unicité des
  codes, références des règles, choix, groupes sans `group`/`file_request` imbriqué).
- Bloquant (si des réponses existent) : item supprimé, type changé, choix retiré alors qu'il est
  utilisé, champ de groupe supprimé, affectation supprimée. `blocked` non vide ⇒ confirmation
  refusée (409).
- Création : `campaigns:manage` ; l'auteur devient gestionnaire. Mise à jour d'une campagne
  existante (même `key`) : gestionnaire ou `campaigns:manage`.
- Répondants par email : seuls les comptes ayant un rôle dans l'église sont retenus ; l'import
  **ajoute**, ne retire jamais (retrait dans l'UI). Les personnes sans compte s'ajoutent dans l'UI.
- Une campagne ouverte reste ouverte ; l'import n'en change pas l'état.

## Accès (`@/modules/campaigns/auth`)

- `getCampaignAccess(session, campaignId)` → `{ campaign, manager: boolean }` ; manager =
  Super Admin, `campaigns:manage` dans l'église **de la campagne**, ou ligne `CampaignManager`.
  Autre église ou aucun droit ⇒ `ApiError(404)`.
- `requireCampaignManager(session, campaignId)`.
- `getAssignmentAccess(session | { token }, assignmentId?)` → `{ assignment, form, campaign,
  role: "manager" | "respondent", respondent? }` ; répondant = `CampaignRespondent.userId` ou
  jeton valide (`matchesHash`, campagne non clôturée). Sinon 404.
- Saisie possible si campagne `OPEN` et état `NOT_STARTED | IN_PROGRESS | CHANGES_REQUESTED`.
  Un gestionnaire peut aussi saisir (correction) mais la soumission reste celle d'un répondant ou
  d'un gestionnaire.
- Gestion des gestionnaires : `campaigns:manage` ou gestionnaire.
- Jetons : `src/modules/campaigns/services/tokens.ts`, même principe que `forms/services/tokens.ts`
  (`CAMPAIGNS_TOKEN_SECRET`, à défaut `AUTH_SECRET` ; `HMAC("campaign-respondent:<id>:<salt>")`,
  empreinte SHA-256 seule stockée ; régénérer = nouveau sel).

## Fichiers

- `storeCampaignFile` : 10 Mo max ; type par **contenu** — PDF (`%PDF`), XLSX (zip `PK\x03\x04`
  ouvert par `jszip`, `[Content_Types].xml` + `xl/workbook.xml` présents, **aucun
  `vbaProject.bin`**), CSV (aucun octet nul, décodable UTF-8 ou Windows-1252, extension `.csv`) ;
  `accept` de la demande respecté ; `maxFiles` respecté. Clé
  `campaigns/<churchId>/<campaignId>/<assignmentId>/<uuid>.<ext>` via `@/lib/file-storage`
  (`storeFile`, `readStoredFile`, `deleteFile`). SHA-256 calculé.
- Téléchargement : la route lit le fichier (`readStoredFile`) et le renvoie avec
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`
  — droits revérifiés à chaque appel, jamais d'URL signée. `logAudit` (sans nom de fichier).
- Dépôt / suppression : répondant tant que modifiable, ou gestionnaire. Remplacement = suppression
  + dépôt.
- Purge (cron `campaigns`, quotidien) : campagnes `CLOSED` depuis plus de `fileRetentionDays` ⇒
  suppression des objets et lignes `CampaignFile`, `filesPurgedAt` posé.

## Notifications (domaine `campaigns`, « Collectes »)

Via `notifyUsers` (comptes) ; `sendEmail` direct pour un répondant sans compte (liste blanche :
destinataire sans compte), lien `/collecte/<jeton>`. Ouverture → répondants ; répondant ajouté à
une campagne ouverte → lui ; correction demandée → répondants ; soumission → gestionnaires ;
relance manuelle (≤ 1 / 24 h / affectation) et automatique J-2 (cron, `dueReminderSentAt`) →
répondants des affectations non soumises. Contenu : titre de la campagne, questionnaire, échéance,
lien. Jamais de valeur.

## Exports (`exceljs`, `sanitizeRow`)

Feuilles : **Réponses** (campagne, questionnaire, destinataire, section, code, code F9
(`reportCode`), libellé, type, valeur — cellule numérique pour `integer`/`decimal`, booléen en
« Oui »/« Non », choix en libellés —, valeur brute, qualificatif, précision, statut, soumis le,
modifié le) ; **Groupes** (destinataire, code du groupe, n° de ligne, code du champ, valeur) ;
**États** (questionnaire, destinataire, état, obligatoires manquantes, estimations, à rechercher,
fichiers attendus/reçus, échéance, soumis le/par, validé, validation Pasteure) ; **Contrôles**
(règle, message, résultat, valeurs) ; **Fichiers** (destinataire, demande, nom, type, taille,
déposé le/par, SHA-256). CSV = feuille Réponses (UTF-8 BOM, `;`). Filtre `form=<key>`.
`logAudit` à chaque export.

## Routes

Pages (`routes.authenticated`) : `/collectes` (mes questionnaires + campagnes gérées + import pour
`campaigns:manage`), `/collectes/[id]` (pilotage : onglets Avancement, Contrôles, Fichiers,
Paramètres/Gestionnaires), `/collectes/[id]/import` (réimport), `/collectes/import` (création),
`/collectes/r/[assignmentId]` (saisie). Public (`routes.public`) : `/collecte` (page
`/collecte/[token]`) et `/api/campaigns/public`.

API (`/api/campaigns`, chacune avec `contract.ts`) :

| Route | Méthodes | Accès |
|---|---|---|
| `/api/campaigns` | GET (mes campagnes gérées + mes affectations) | connecté |
| `/api/campaigns/import` | POST `{ definition, dryRun }` | `campaigns:manage` (création) / gestionnaire (mise à jour) |
| `/api/campaigns/[id]` | GET (détail + avancement + contrôles), PATCH (paramètres) | gestionnaire |
| `/api/campaigns/[id]/status` | POST `{ action: open \| close \| reopen }` | gestionnaire |
| `/api/campaigns/[id]/managers` | GET, POST `{ userId }` | gestionnaire / `campaigns:manage` |
| `/api/campaigns/[id]/managers/[userId]` | DELETE (jamais le dernier) | idem |
| `/api/campaigns/[id]/export` | GET `?format=xlsx\|csv&form=` | gestionnaire |
| `/api/campaigns/[id]/candidates` | GET `?q=` comptes de l'église (ajout gestionnaire/répondant) | gestionnaire |
| `/api/campaigns/assignments/[id]` | GET (définition, réponses, fichiers, alertes locales, état) | répondant / gestionnaire |
| `/api/campaigns/assignments/[id]/answers` | PUT `{ answers: [{ code, value, qualifier, note }] }` (≤ 100, sauvegarde partielle) | idem, modifiable |
| `/api/campaigns/assignments/[id]/submit` | POST | idem |
| `/api/campaigns/assignments/[id]/review` | POST `{ action: request_changes \| validate, reason?, pastoralValidated? }` | gestionnaire |
| `/api/campaigns/assignments/[id]/remind` | POST | gestionnaire |
| `/api/campaigns/assignments/[id]/respondents` | GET, POST `{ userId } \| { name, email }` | gestionnaire |
| `/api/campaigns/assignments/[id]/respondents/[rid]` | DELETE ; POST `…/link` (génère/régénère, envoie le lien à un sans-compte) | gestionnaire |
| `/api/campaigns/assignments/[id]/files` | POST multipart `{ requestCode, file }` | répondant / gestionnaire |
| `/api/campaigns/files/[fileId]` | GET (téléchargement), DELETE | répondant (sa campagne, modifiable pour DELETE) / gestionnaire |
| `/api/campaigns/public/[token]` | GET | jeton |
| `/api/campaigns/public/[token]/answers` | PUT | jeton |
| `/api/campaigns/public/[token]/submit` | POST | jeton |
| `/api/campaigns/public/[token]/files` | POST | jeton |
| `/api/campaigns/public/[token]/files/[fileId]` | GET, DELETE | jeton |

Débit : `requireRateLimit` (`RATE_LIMIT_MUTATION` sur les mutations, `RATE_LIMIT_SENSITIVE` sur
les routes à jeton et les dépôts).

## Code partagé

Services du module (`src/modules/campaigns/services/`) :

| Fichier | Contenu |
|---|---|
| `definition.ts` | `validateDefinition`, `flattenItems`, `itemIndex`, `validateAnswerValue(item, value, qualifier, note)`, `completeness(items, answers, files)` |
| `rules.ts` | `evaluateRule`, `evaluateRules(rules, valuesByCode)`, `ruleScope(rule, codesByForm)` |
| `import.ts` | `importCampaign` (aperçu + application) |
| `campaigns.ts` | `listMyCampaigns`, `getCampaignOverview` (avancement, contrôles croisés), `updateCampaignSettings`, `changeCampaignStatus`, managers |
| `assignments.ts` | `getAssignmentView`, `saveAnswers`, `submitAssignment`, `reviewAssignment`, respondents |
| `files.ts` | `sniffCampaignFile`, `storeCampaignFile`, `readCampaignFile`, `deleteCampaignFile`, `purgeExpiredFiles` |
| `tokens.ts` | jetons dérivés |
| `notify.ts` | notifications et relances (`remindAssignment`, `runDueReminders`) |
| `exports.ts` | `exportCampaign` |

Pur et testé sans base : `schemas.ts`, `definition.ts`, `rules.ts`, `sniffCampaignFile`.

## MCP (lot 5)

Lectures (gestionnaire, campagnes de l'église de la connexion) : `campaigns_list`,
`campaign_progress` (états, manquants, estimations, fichiers reçus : métadonnées seulement — pas de
valeur pour un questionnaire `confidential`). Actions aperçu → confirmation :
`import_campaign_preview/confirm` (même service, `dryRun`), `set_campaign_status_preview/confirm`.
Ajout à `MCP_TOOLS`, audience des fiches de l'assistant (prédicat `campaignManager`).

## F9 2026

`specs/090-campagnes-collecte/f9-2026.json` (définition), généré du catalogue V7 sans reformuler ;
codes internes `M0_C`, `M1_C` (Comptabilité, contributeurs réguliers hors S.T.A.R/disciples) et
`N` (Intégration, population unique des nouveaux) en `internal: true` ; choix officiels de F1–F5
et P1 à confirmer (libellés provisoires marqués « [À CONFIRMER] »). Test
`f9-definition.test.ts` : définition valide, 79 codes officiels présents une fois.

## Alternatives écartées

- Étendre `forms` : moteur entier à modifier (décimaux, fichiers, groupes, qualificatifs,
  brouillon partiel, affectation, cycle de vie), risque de régression sur un module en production.
- Lien public à jeton par défaut : moins traçable ; réservé aux personnes sans compte.
- URL signées S3 pour les fichiers : transférables pendant leur validité ; la route revérifie les
  droits à chaque téléchargement.
