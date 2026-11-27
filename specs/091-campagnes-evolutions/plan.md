# Plan — 091 Campagnes de collecte : évolutions post-recette

- **Statut** : En cours
- **ADR** : [ADR-0032](../../docs/adr/0032-campagnes-de-collecte.md) inchangé. L'éditeur graphique est
  le « générateur du même document » qu'il annonçait. Pas de nouvel ADR : aucune décision
  nouvelle, durable et transverse.

## Principe directeur

**Un seul modèle**, le document `koinonia.campaign` v1, et **une seule porte d'écriture de la
structure** : `importCampaign` (aperçu, blocages, révisions).
- L'éditeur graphique produit un document complet et l'enregistre par l'import.
- L'export reconstruit ce document depuis la base.
- La duplication exporte, ajuste, puis importe en création.

Aucun second moteur, aucune seconde représentation, aucune règle propre au F9.

## Conformité constitution

- Migration `prisma migrate dev --name campaign_message_templates` : une colonne nullable,
  non destructive.
- `campaigns` n'importe aucun autre module. `src/app` n'importe que l'index, `auth` et
  `schemas` du module.
- Toute nouvelle route : `contract.ts` voisin, `npm run openapi`, préfixe déjà déclaré
  (`/api/campaigns`, `/collectes`). Aucune nouvelle route publique.
- Aucune nouvelle permission. Gardes existantes : `requireCampaignManager`,
  `requireAssignmentManager`, `requireCampaignsManage` / `hasCampaignsManage`.
- UI : `src/components/ui` (Button, Modal, ConfirmModal, Field, Select, Textarea, Checkbox,
  Tabs, StatusChip, Alert, useToast…), tokens sémantiques, mobile d'abord.
- Tests unitaires de chaque service et de chaque fonction pure ; tests de route sur les gardes.

## Données

```prisma
model Campaign {
  // …
  /// Modèles de messages personnalisés (spec 091) : { initial?, progress?, collective?,
  /// individual?, overdue?, resubmission? } — absent = textes par défaut.
  messageTemplates Json?
}
```

La réouverture et l'annulation de validation n'ont besoin d'aucune colonne : elles réutilisent
les statuts et `reviewReason`/`reviewedAt`/`reviewedById`.

## Format `koinonia.campaign` v1 — extension compatible

`campaign.messages?` : objet strict, chaque clé facultative parmi `MESSAGE_KINDS`
(`initial`, `progress`, `collective`, `individual`, `overdue`, `resubmission`), texte de
1 à 5000 caractères. Les anciens documents restent valides. L'import écrit
`Campaign.messageTemplates` (absent ⇒ null) ; l'export les restitue.

Action « campagne » de l'aperçu d'import :
- Elle était `unchanged` si l'empreinte du document entier était identique.
- Elle se calcule désormais sur les **champs de campagne** : titre, description, période,
  échéance, conservation, règles et messages en JSON canonique.
- Raison : un document exporté (sans répondants) doit être annoncé « inchangé ».
- `definitionHash` reste enregistré.

## Fonctions pures partagées (client et serveur)

Elles sont réexportées par `@/modules/campaigns/schemas`, comme `visibleQuestionIds` de
`forms` :
- `services/messages.ts` :
  - `MESSAGE_KINDS`, `MESSAGE_KIND_LABELS`, `DEFAULT_MESSAGE_TEMPLATES` ;
  - `MESSAGE_PLACEHOLDERS`, avec leur description ;
  - `renderTemplate(template, vars)` : variables inconnues laissées vides, aucun HTML ;
  - `composeMessage(kind, ctx, options)`.
  Contexte `ctx` :
  - `churchName`, `campaignTitle`, `appUrl`, `now` ;
  - les contributions (`{ formTitle, confidential, label, status, dueAt, link? }`).
  Options :
  - statuts ciblés, `overdueOnly`, `detail: "short" | "full"` ;
  - `showDone`, `showRemaining`, `includeConfidential` (faux par défaut).
  Comportement :
  - Sans `includeConfidential`, les confidentiels sont retirés des listes **et des
    totaux**, et une ligne de périmètre est ajoutée (« N contributions confidentielles non
    comptées »).
  - Le taux est calculé par contribution.
  - Les messages collectifs (`progress`, `collective`) n'acceptent **aucun** `link` : le
    lien générique est `${appUrl}/collectes`.
  - Format WhatsApp : `*gras*`, `_italique_`, dates en français (Europe/Paris).
- `services/definition.ts` → `validateDefinition` est déjà pur, réexporté pour l'éditeur.
- `services/preview.ts` → `previewAssignmentView(campaign, form, label)` construit un
  `AssignmentView` vide (rôle gestionnaire, `editable: true`, réponses, fichiers et alertes
  vides, `completeness` calculée sur aucune réponse) depuis une définition stockée ou en cours
  d'édition.

## Services du module

| Service | Rôle |
|---|---|
| `exportCampaignDefinition(campaignId, { omitConfidential? })` | Reconstruit le document v1 depuis la base : champs de campagne, `messages`, questionnaires dans l'ordre (`intro`, `sections`, `confidential`), destinataires dans l'ordre (`dueAt` en jour `AAAA-MM-JJ` s'il vaut `dueAtToDate(jour)`, sinon ISO avec décalage), règles. **Jamais** `respondents`. Passe par `campaignDefinitionSchema.parse` + `validateDefinition`. Avec `omitConfidential`, retire les questionnaires confidentiels et les règles qui lisent leurs codes |
| `duplicateCampaign(sourceId, input, actor, churchId)` | Export complet, nouvelle clé (titre en slug + suffixe unique), nouveau titre, dates. `keepAssignments: false` ⇒ un destinataire par questionnaire (libellé = titre du questionnaire, sans échéance). Puis `importCampaign` en création. Rien d'autre n'est copié |
| `reopenAssignment(access, reason?)` | `SUBMITTED` → `IN_PROGRESS`, campagne `OPEN`, prise conditionnelle (`updateMany` sur statut). Remet `submittedAt`/`submittedByName` à null, renseigne `reviewReason`, `reviewedAt`, `reviewedById`. `auditCampaign` + `notifyAssignmentReopened` (domaine `campaigns`, motif éventuel, jamais de valeur) |
| `unvalidateAssignment(access, reason?)` | `VALIDATED` → `SUBMITTED`, efface `validatedAt`, `validatedById`, `pastoralValidated`. Audit, sans notification |
| `replaceRespondent(access, oldId, input)` | Ajout du nouveau (même règle qu'`addRespondent`) puis retrait de l'ancien, dans une transaction sous `lockAssignment`. Notifié s'il est ajouté à une campagne ouverte |
| `removeRespondent` | Sous `lockAssignment`, refus 409 si la campagne est `OPEN` et qu'il ne resterait aucun répondant valide (même prédicat qu'`assignmentsWithoutRespondent`) : « C'est le dernier répondant de ce destinataire : utilisez « Remplacer » » |
| `getRespondentLink(access, respondentId)` | Gestionnaire seulement. Lien personnel actif, créé s'il n'existe pas encore (`ensureRespondentLink`). Audit `{ link: "viewed" }` par identifiants |
| `setAssignmentDueAt(access, dueAt \| null)` | Échéance d'une contribution, audit. Si la nouvelle échéance est postérieure, `dueReminderSentAt` repasse à null pour permettre une nouvelle relance J-2 |
| `campaignReadiness(campaignId)` | Liste `{ key, label, ok, detail? }` : questionnaires, questions, définition valide (export puis `validateDefinition`), échéances non dépassées, destinataires, répondants valides (`assignmentsWithoutRespondent`), contrôles valides, questionnaires confidentiels (nombre et rappel de qui les lit). Lecture seule |
| `mergeHiddenConfidential(campaignId, definition)` | Pour le MCP seulement. Ajoute au document reçu les questionnaires confidentiels existants absents (clé absente), à leur position, et les règles absentes (par clé) qui lisent leurs codes. Si le document contient la clé d'un questionnaire confidentiel existant : refus |
| `getCampaignOverview` | Ajoute `churchName` et `messageTemplates`. Pour chaque contribution, ajoute `issues: { code, label, kind }[]` (`missing`, `to_research`, `estimate`, `file_pending`, `check`, ce dernier avec le message de la règle locale non respectée) et `exploitable` (soumis ou validé, sans `missing`, `to_research`, `file_pending` ni `check`) |
| `updateCampaignSettings` | Accepte `messageTemplates` (objet partiel ; `null` remet les textes par défaut) |

`file_pending` : demande de fichier obligatoire sans état, à l'état `TO_RESEARCH`, ou
« fichier transmis » sans fichier.

## Routes (avec `contract.ts`)

| Méthode | Route | Garde |
|---|---|---|
| GET | `/api/campaigns/[id]/definition` (`?download=1` ⇒ pièce jointe `<clé>.json`) | `requireCampaignManager` |
| POST | `/api/campaigns/[id]/duplicate` | `requireCampaignManager` + `hasCampaignsManage` dans l'église de la source |
| GET | `/api/campaigns/[id]/readiness` | `requireCampaignManager` |
| POST | `/api/campaigns/assignments/[id]/review` | Existant, élargi : `action: "reopen" \| "unvalidate"` (motif facultatif) |
| PATCH | `/api/campaigns/assignments/[id]` | Existant ou ajouté : `{ dueAt }`, `requireAssignmentManager` |
| POST | `/api/campaigns/assignments/[id]/respondents/[rid]/replace` | `requireAssignmentManager` |
| GET | `/api/campaigns/assignments/[id]/respondents/[rid]/link` | `requireAssignmentManager`, ajouté à la route existante |
| PATCH | `/api/campaigns/[id]` | Existant, `messageTemplates` ajouté au corps |

La création d'une campagne vierge passe par l'import existant (`POST /api/campaigns/import`) :
l'éditeur envoie un document minimal valide.

## Pages et composants

- **Communication** (`/collectes/[id]`, bouton « Communication » de l'en-tête) :
  `CommunicationModal`, construit sur `composeMessage`. Choix du type et des cibles, options,
  `Textarea` modifiable, « Copier » (`navigator.clipboard`) et toast. Le lien personnel d'un
  sans-compte se récupère à la demande (GET `…/link`) et donne **un message par personne**.
  Chaque ligne du Suivi a « Message » (relance individuelle).
- **Modèles** dans l'onglet Paramètres : un `Textarea` par type, liste des variables,
  « Rétablir le texte par défaut ».
- **Suivi** :
  - filtres « À rechercher », « Estimations », « Manquants », « Contrôles », « Fichiers »,
    « Exploitables » ;
  - pastille « Exploitable » distincte de « Soumis » ;
  - questions concernées dans un panneau dépliable ;
  - actions de ligne « Rouvrir », « Annuler la validation » (`ConfirmModal`, motif facultatif),
    « Échéance » (Modal) et « Aperçu ».
- **Répondants** : « Remplacer » (`CandidatePicker` réutilisé, ou personne sans compte), « Voir
  le lien » (sans-compte).
- **Préparer l'ouverture** : panneau de synthèse (`readiness`) en brouillon, rappelé dans la
  confirmation d'ouverture.
- **Export** : « Télécharger la définition (JSON) », « Dupliquer » (Modal : titre, dates,
  conserver les destinataires).
- **Aperçu** : `/collectes/[id]/apercu/[formId]`, page serveur gestionnaire seulement.
  `AssignmentForm` reçoit un mode `preview` : aucun appel réseau, état local seulement, bandeau
  « Aperçu : rien n'est enregistré », soumission et dépôt simulés. Bascule « Téléphone »
  (cadre de 390 px).
- **Éditeur** : `/collectes/nouvelle` (`campaigns:manage`) et `/collectes/[id]/editer`
  (gestionnaire). `CampaignEditor` client, dont l'état est un `CampaignDefinition` :
  - **Paramètres généraux**, dont les modèles de messages.
  - **Questionnaires** :
    - liste réordonnable par boutons haut/bas (pas de glisser-déposer) ;
    - dupliquer, supprimer, confidentiel ;
    - consignes ;
    - destinataires : libellé et échéance.
  - **Sections** et **questions** :
    - formulaire par type ;
    - choix avec « exclusif » ;
    - groupe : sous-champs ;
    - demande de fichier : formats, nombre maximal ;
    - « Avancé » : code affiché en lecture seule, code de restitution, interne.
  - **Contrôles** :
    - éditeur simple : comparaison entre une question ou une valeur et une question ou une
      valeur ;
    - « si (comparaison) alors (comparaison) » ;
    - toute autre règle dans une zone JSON validée par `ruleCheckSchema`.
  - **Identifiants** :
    - codes `Q_` + 6 caractères base 36 aléatoires, vérifiés uniques dans le document ;
    - clés `f-`, `s-`, `d-`, `r-`, `c-` + 6 caractères ;
    - générés une fois, jamais recalculés depuis un libellé, donc jamais réutilisés.
  - **Validation** côté client par `campaignDefinitionSchema` + `validateDefinition`, erreurs
    rattachées à leur élément quand c'est possible.
  - **Enregistrer** : import en aperçu (`dryRun`), affichage par le composant d'aperçu extrait
    d'`ImportCampaign` (`ImportPreviewView`), puis application. Les blocages sont affichés tels
    quels.
  - « Aperçu répondant » d'un questionnaire en cours d'édition : `previewAssignmentView` sur
    l'état local.
  - Garde de sortie si des modifications ne sont pas enregistrées.
- **Accueil des collectes** : boutons « Nouvelle campagne » (éditeur) et « Importer »
  (existant), pour `campaigns:manage`.

## MCP

Tous dans `src/app/api/mcp/_actions/campaigns.ts`, avec le même `available` (gestionnaire) :
- `campaign_import_contract` (`kind: "read"`, sans entrée) : version, JSON Schema
  (`z.toJSONSchema(campaignDefinitionSchema, { io: "input" })` à l'exécution, donc sans
  divergence), types et libellés, qualificatifs et règle par défaut, formes de contrôles,
  contraintes sémantiques en plus du schéma, exemple minimal valide (vérifié par un test).
- `campaign_structure` (`kind: "read"`, `campaign`) :
  - questionnaires (titre, confidentiel, révision) ;
  - destinataires (libellé, échéance, statut) ;
  - pour les non confidentiels : sections et questions (code, libellé, type, obligatoire,
    unité, choix) ;
  - confidentiel : titre et état seulement.
- `export_campaign_definition` (`kind: "read"`, `campaign`) :
  `exportCampaignDefinition({ omitConfidential: true })`, avec la mention « N questionnaire(s)
  confidentiel(s) omis ; conservés d'office à l'import par l'assistant ».
- `import_campaign_preview/confirm` (existants) : `mergeHiddenConfidential` avant l'aperçu et
  avant l'application.
- `reopen_contribution_preview/confirm` (`assignment` : identifiant, motif facultatif) :
  - résumé : campagne, questionnaire, destinataire, statut ;
  - empreinte : statut et `updatedAt` ;
  - `reopenAssignment` avec `withAuditContext({ via: "mcp" })`.
- Rien d'autre : aucun message, aucun lien, aucune personne.

## Tests

- Unitaires :
  - `messages` : rendu, collectifs sans lien, confidentiels exclus des listes et des totaux,
    taux par contribution, retards ;
  - `previewAssignmentView` ;
  - aller-retour `export → import` = « inchangé » sur `f9-2026.json` et sur l'exemple, `messages`
    compris ;
  - `exportCampaignDefinition({ omitConfidential })` ;
  - `mergeHiddenConfidential` ;
  - `duplicateCampaign` (rien d'autre que la structure) ;
  - `reopen` et `unvalidate` (transitions, campagne ouverte, prise conditionnelle) ;
  - `replaceRespondent` ;
  - refus du dernier répondant ;
  - `setAssignmentDueAt` ;
  - `getRespondentLink` (gestionnaire seulement) ;
  - `campaignReadiness` ;
  - `issues` et `exploitable`.
- Routes : gardes (non gestionnaire ⇒ 404), corps validés.
- MCP : contrat (le schéma valide l'exemple), structure sans contenu confidentiel, export sans
  confidentiel, import qui conserve les confidentiels, réouverture en aperçu puis confirmation,
  aucune fuite (email, nom, lien).
- Éditeur : fonctions pures de génération d'identifiants et de transformation de l'état, avec
  leurs tests.

## Documentation

- `CLAUDE.md`, section du module.
- `docs/processus/collectes.md`, `docs/campagnes-f9-2026.md` : communication, réouverture,
  éditeur.
- Fiches de l'assistant (`knowledge/espaces.ts`).
- `CHANGELOG.md`.
- `docs/database.md` : colonne `messageTemplates`.

## Livraison

Branche `feat/campagnes-evolutions`, PR vers `feat/campagnes-collecte` (branche de la PR #780),
déploiement en recette depuis cette branche.
