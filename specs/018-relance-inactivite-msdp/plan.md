# Plan technique — Relance d'inactivité pour les suivis MSDP bloqués

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-23

## Vérification de conformité (constitution)

- [x] **Frontières modules** : logique ajoutée dans `src/modules/integration/services/msdp-service.ts`, exportée via `src/modules/integration/index.ts` — pas de nouvel import cross-module
- [x] **Sécurité** : le nouveau code s'exécute côté serveur dans le cron déjà protégé par `authorizeCron` (`CRON_SECRET`) — pas de nouvelle route API exposée
- [x] **Permissions** via `rolePermissions` : non applicable (job cron, pas de route utilisateur)
- [x] **Validation** Zod : non applicable (aucune entrée utilisateur)
- [x] **Migration** Prisma : `[Aucune]` — `Notification.type` est un `String` libre, pas d'enum à étendre
- [x] **Enums** importés depuis `@/generated/prisma/client` : `MsdpStatus` déjà généré, réutilisé tel quel
- [x] **UI** : `[Aucun changement]` — feature 100% backend/notification

## Approche générale

Ajouter `runMsdpInactivityNotifications(appUrl)` dans
`src/modules/integration/services/msdp-service.ts`, calquée sur
`runInactivityNotifications` (`family-service.ts:184-283`) mais adaptée au
modèle `MsdpFollowUp` : mêmes principes (seuil de 7 jours, dédoublonnage par
notification récente, agrégation Promise.all), messages contextualisés par
statut, destinataire = conseiller assigné sinon équipe MSDP/intégration.
L'appeler depuis l'orchestrateur cron existant (`src/app/api/cron/route.ts`)
en parallèle des tâches déjà en place, sans créer de nouvelle route — exactement
le pattern que la suppression de la route dupliquée (issue #449) vient de
renforcer.

## Modèle de données

`[Aucun changement]` — aucun champ ni migration nécessaire.

`MsdpFollowUp.updatedAt` (déjà existant, mis à jour automatiquement par
Prisma `@updatedAt`) sert de base au calcul d'inactivité, exactement comme
`FamilyIntegrationRequest.updatedAt` pour le mécanisme existant. Toute
modification du suivi (changement de statut, assignation, notes) le remet
donc à jour et réinitialise le délai — couvre le critère d'acceptation
"le compteur repart de zéro".

`Notification.type = "MSDP_INACTIVITY"` (nouvelle valeur de chaîne libre,
pas de migration).

## API

`[Aucun changement]` — aucune route ajoutée ni modifiée.
`POST /api/cron` (existant, protégé par `CRON_SECRET`) invoque la nouvelle
fonction en plus des tâches déjà orchestrées.

## Services / logique métier

*Fichier : `src/modules/integration/services/msdp-service.ts`*

- **`buildMsdpInactivityEmail(params): string`** — calquée sur
  `buildInactivityEmail` de `family-service.ts` (même charte visuelle,
  bandeau `#5E17EB`), avec un `contextMap` propre aux statuts MSDP :
  ```
  ASSIGNED      → "Un conseiller a été assigné mais le contact n'a pas encore été établi."
  CONTACTED     → "Le contact a été établi mais la formation n'a pas encore démarré."
  IN_FORMATION  → "La personne est en formation mais aucune progression récente n'a été enregistrée."
  ```
  (statut `SUBMITTED` inclus par cohérence si un suivi MSDP existe sans
  conseiller assigné — voir cas limite spec ; message : "Aucun conseiller
  n'a encore été assigné à ce suivi.")

- **`runMsdpInactivityNotifications(appUrl: string): Promise<{ notified: number; skipped: number; total: number }>`**
  1. Seuil = 7 jours (`INACTIVITY_DAYS`, même valeur que le flux famille —
     constante dupliquée localement, pas d'import cross-fichier pour rester
     dans les frontières module).
  2. `prisma.msdpFollowUp.findMany({ where: { status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] }, updatedAt: { lt: threshold } }, include: { assignedConseillerMsdp: {...}, request: { select: { firstName, lastName } }, church: {...} } })`
     — `COMPLETED`/`ABANDONED` exclus par construction (couvre le critère
     "jamais concerné").
  3. Dédoublonnage : recherche des `Notification` de type `MSDP_INACTIVITY`
     avec `link` correspondant créées dans la fenêtre des 7 derniers jours
     (même pattern que `family-service.ts`) — couvre "pas de nouvelle alerte
     tant que l'intervalle n'est pas écoulé".
  4. Pour chaque suivi stale non déjà notifié :
     - Si `assignedConseillerMsdpId` renseigné → notification in-app +
       email (si `SMTP_HOST` configuré et email du conseiller renseigné,
       même garde que l'existant) au conseiller.
     - Sinon → notification aux membres du département `function: "MSDP"`
       de l'église (réutilise le pattern `getManagers` de
       `family-service.ts`, adapté au filtre `"MSDP"` au lieu de
       `"INTEGRATION"`).
  5. Chaque envoi (notification + email) est individuellement `.catch(() => {})`
     — un échec sur un suivi n'interrompt pas la boucle (couvre le critère
     "l'échec n'empêche pas le traitement des autres").

*Fichier : `src/modules/integration/index.ts`*
- Exporter `runMsdpInactivityNotifications` (et `buildMsdpInactivityEmail`
  pour les tests, même pattern que les exports existants du module).

*Fichier : `src/app/api/cron/route.ts`*
- Importer `runMsdpInactivityNotifications` depuis `@/modules/integration`.
- L'ajouter au `Promise.all([...])` existant, résultat exposé sous
  `msdpInactivity` dans la réponse JSON de l'endpoint.

## UI / composants

`[Aucun changement]`

## Décisions & alternatives écartées

- **Choix** : dupliquer la constante `INACTIVITY_DAYS = 7` localement dans
  `msdp-service.ts` plutôt que de l'importer depuis `family-service.ts` —
  *Pourquoi* : les deux fichiers vivent dans le même module (`integration`),
  un import direct serait techniquement possible, mais le coupler créerait
  une dépendance artificielle entre deux flux fonctionnellement indépendants
  (famille vs MSDP) pour économiser une ligne ; si le délai MSDP doit un
  jour diverger de celui des familles (cf. spec, tranché identique pour
  l'instant mais pas garanti à vie), le découplage évite un effet de bord.
- **Choix** : réutiliser le job cron existant (`/api/cron`) plutôt que créer
  une route dédiée — *Pourquoi* : explicitement demandé par la spec, et
  cohérent avec la suppression de la route dupliquée `/api/cron/integration-inactivity`
  (issue #449, PR #456) qui vient d'établir ce pattern comme la norme du
  projet.
- **Écarté** : introduire un enum Prisma pour `Notification.type` — *Raison* :
  hors périmètre de cette feature, le champ est déjà un `String` libre
  utilisé de façon cohérente par convention (`INTEGRATION_INACTIVITY`,
  `MSDP_ASSIGNED`...) ; changer ce choix structurel n'est pas nécessaire ici.
- **Écarté** : notifier systématiquement l'équipe MSDP **en plus** du
  conseiller assigné (double alerte) — *Raison* : non demandé par la spec
  (un conseiller assigné est le destinataire suffisant), et risquerait de
  diluer la responsabilité individuelle du conseiller.

## Risques & points d'attention

- Le filtre `department.function === "MSDP"` suppose qu'un tel département
  existe et a des membres rattachés dans chaque église concernée — comme
  pour `"INTEGRATION"` dans le flux famille, si aucun département MSDP
  n'est configuré, `getManagers` retournera une liste vide et aucune alerte
  ne sera envoyée pour les suivis sans conseiller (dégradation silencieuse,
  cohérente avec le comportement déjà accepté du flux famille).
- Le nom du type de notification (`MSDP_INACTIVITY`) doit être unique et ne
  pas entrer en collision avec `MSDP_ASSIGNED` déjà utilisé par
  `notifyMsdpCounselorAssigned` (spec 016) — vérifié, pas de collision.

## Stratégie de tests

*Fichier : `src/modules/integration/__tests__/msdp-service.test.ts` (existant, étendu)*

- `buildMsdpInactivityEmail` : contenu HTML contient le nom de la personne,
  le statut contextualisé, le lien vers le suivi.
- `runMsdpInactivityNotifications` :
  - Suivi `ASSIGNED` inactif depuis 7+ jours avec conseiller → notification +
    email au conseiller.
  - Suivi `SUBMITTED`/sans conseiller assigné, inactif → notification aux
    membres du département `MSDP` de l'église.
  - Suivi `COMPLETED`/`ABANDONED` inactif → jamais inclus dans les suivis
    traités (vérifié via l'argument `where` du mock Prisma ou l'absence de
    notification créée).
  - Suivi déjà notifié récemment (notification `MSDP_INACTIVITY` < 7 jours)
    → pas de nouvelle notification (`skipped` incrémenté).
  - Échec d'envoi d'email sur un suivi → ne lève pas d'exception, les autres
    suivis du même appel sont bien traités.
