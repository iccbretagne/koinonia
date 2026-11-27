# Tâches — 091 Campagnes de collecte : évolutions post-recette

## Lot 1 — Socle serveur (P1 et P2)
- [ ] Migration `campaign_message_templates` (`Campaign.messageTemplates Json?`)
- [ ] `campaign.messages` dans le format v1 ; import et action « campagne » calculée par champs
- [ ] `services/messages.ts` (modèles par défaut, `renderTemplate`, `composeMessage`) + tests
- [ ] `services/preview.ts` (`previewAssignmentView`) + tests ; réexports purs par `schemas`
- [ ] `exportCampaignDefinition` (+ `omitConfidential`), aller-retour « inchangé » + tests
- [ ] `duplicateCampaign` + route `POST /api/campaigns/[id]/duplicate` + tests
- [ ] `reopenAssignment`, `unvalidateAssignment`, `notifyAssignmentReopened` ; route review élargie + tests
- [ ] `removeRespondent` : dernier répondant refusé en campagne ouverte ; `replaceRespondent` + route ; `getRespondentLink` (GET `…/link`) + tests
- [ ] `setAssignmentDueAt` + route PATCH + tests
- [ ] `campaignReadiness` + route + tests
- [ ] `getCampaignOverview` : `churchName`, `messageTemplates`, `issues`, `exploitable` ; paramètres : `messageTemplates`
- [ ] Routes `GET /api/campaigns/[id]/definition` ; `contract.ts` partout ; `npm run openapi`
- [ ] MCP : `campaign_import_contract`, `campaign_structure`, `export_campaign_definition`, `reopen_contribution_*`, `mergeHiddenConfidential` à l'import + tests

## Lot 2 — Pilotage (UI, P1)
- [ ] Communication (modale, messages individuels et collectifs, copie) ; action « Message » par ligne
- [ ] Modèles de messages dans Paramètres
- [ ] Suivi : filtres, questions concernées, « Exploitable », Rouvrir / Annuler la validation / Échéance / Aperçu
- [ ] Répondants : Remplacer, Voir le lien
- [ ] Préparer l'ouverture (synthèse) ; Export : définition JSON, Dupliquer

## Lot 3 — Aperçu et éditeur (UI, P1 pour l'aperçu, P2 pour l'éditeur)
- [ ] `AssignmentForm` en mode aperçu ; page `/collectes/[id]/apercu/[formId]` (cadre téléphone)
- [ ] `ImportPreviewView` extrait d'`ImportCampaign`
- [ ] Éditeur `/collectes/nouvelle` et `/collectes/[id]/editer` (paramètres, questionnaires, sections, questions de tous types, destinataires, contrôles simples + JSON, aperçu, enregistrement par import)
- [ ] Entrées « Nouvelle campagne » / « Importer » sur `/collectes`

## Finition
- [ ] Documentation (`CLAUDE.md`, `docs/processus/collectes.md`, `docs/campagnes-f9-2026.md`, `docs/database.md`, fiches de l'assistant, CHANGELOG)
- [ ] typecheck, lint, lint:boundaries, tests, openapi, build
- [ ] Revue de code, PR vers `feat/campagnes-collecte`, déploiement en recette
