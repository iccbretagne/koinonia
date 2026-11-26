# ADR-0032 — Campagnes de collecte : module distinct de `forms`, définition JSON versionnée, réponses par code

- **Statut** : Accepté
- **Date** : 2026-11-26

## Contexte

La spec 090 introduit des campagnes de collecte (premier usage : bilan F9 2026) : plusieurs
questionnaires affectés à des destinataires nommés, saisis en plusieurs fois, soumis, corrigés,
validés, avec fichiers de rapprochement et contrôles de cohérence. Koinonia a déjà un moteur de
formulaires (`forms`, ADR-0030), en production pour les inscriptions et sondages.

Trois choix sont durables : où vit le moteur, comment une définition est créée et versionnée, et
comment les réponses sont stockées.

## Décision

1. **Un module `campaigns` distinct**, qui reprend les principes d'ADR-0030 (types fermés,
   validation serveur dérivée de la définition, droits stockés comme données) sans étendre le
   moteur de `forms`. Il ne dépend que de `core`.
2. **La définition est un document JSON versionné** (`format: "koinonia.campaign"`,
   `version: 1`), validé par Zod, créé et mis à jour par **import** (aperçu puis confirmation),
   idempotent par clés stables (`campaign.key`, `form.key`, `assignment.key`, `code`). Il est
   stocké par questionnaire avec une empreinte et une révision. Une mise à jour qui ferait perdre
   des réponses est refusée. Pas d'éditeur graphique à ce stade.
3. **Une ligne par réponse et par code** (`CampaignAnswer`, valeur JSON + qualificatif + note),
   enregistrée champ par champ : sauvegarde automatique, plusieurs répondants, export direct par
   code. Les codes sont uniques dans une campagne et servent de clé de consolidation.
4. **Les contrôles de cohérence sont des règles déclaratives** (arbre JSON : comparaisons,
   sommes, chaînes, implications) portées par la définition, jamais codées dans le moteur ; elles
   ne bloquent jamais une saisie.

## Alternatives considérées

- **Étendre `forms`** : décimaux, fichiers, groupes répétables, qualificatifs (estimation, NSP,
  sans objet), brouillon partiel, affectation nominative et cycle de vie à ajouter — presque tout
  le moteur à modifier, avec un risque de régression sur les inscriptions en cours.
- **Questions en lignes typées (comme `forms`)** : adapté à un éditeur graphique ; ici la
  définition arrive entière par import, et un document versionné rend la comparaison et le
  réimport plus simples.
- **Expressions de règles en texte** : nécessite un analyseur ; l'arbre JSON suffit.

## Conséquences

- Deux moteurs de formulaires coexistent ; une convergence reste possible (ex. `forms` lisant une
  définition au même format) mais n'est pas engagée.
- Ajouter un type de question = étendre le schéma Zod, la validation et le rendu.
- Un éditeur graphique pourra produire le même document sans changer le stockage.

## Références

- `specs/090-campagnes-collecte/spec.md`, `specs/090-campagnes-collecte/plan.md`
- ADR-0030 (moteur de formulaires), ADR-0023 (contrats d'API), ADR-0012 (surface HTTP)
