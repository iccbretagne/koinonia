# Tâches — Relance d'inactivité pour les suivis MSDP bloqués

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : services → API → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/relance-inactivite-msdp`
- [x] Migration Prisma : `[Aucune]` — pas de changement de schéma (confirmé dans `plan.md`)

## Tâches

### 1. Logique métier (services)

- [x] **T1** — Ajouter `buildMsdpInactivityEmail(params: { churchName, personName, status, daysSince, link, appUrl }): string` dans `src/modules/integration/services/msdp-service.ts`, calquée sur `buildInactivityEmail` (`family-service.ts:88`) : même charte visuelle (bandeau `#5E17EB`), `contextMap` propre aux statuts MSDP (`SUBMITTED`, `ASSIGNED`, `CONTACTED`, `IN_FORMATION`). *(fichier : `src/modules/integration/services/msdp-service.ts`)*

- [x] **T2** — Ajouter `runMsdpInactivityNotifications(appUrl: string): Promise<{ notified: number; skipped: number; total: number }>` dans `src/modules/integration/services/msdp-service.ts` : constante locale `MSDP_INACTIVITY_DAYS = 7` et `MSDP_INACTIVITY_NOTIF_TYPE = "MSDP_INACTIVITY"` ; requête `prisma.msdpFollowUp.findMany` filtrant `status: { in: ["SUBMITTED", "ASSIGNED", "CONTACTED", "IN_FORMATION"] }` et `updatedAt: { lt: threshold }` ; dédoublonnage via les `Notification` de type `MSDP_INACTIVITY` créées dans la fenêtre des 7 derniers jours. *(fichier : `src/modules/integration/services/msdp-service.ts`)*

- [x] **T3** — Dans `runMsdpInactivityNotifications`, brancher la logique de destinataire : si `assignedConseillerMsdp` renseigné → notification in-app + email (`.catch(() => {})`) au conseiller ; sinon → notification aux membres du département `function: "MSDP"` de l'église (fonction `getMsdpManagers` adaptée du pattern `family-service.ts`, filtrant `"MSDP"` au lieu de `"INTEGRATION"`). Chaque envoi individuellement catché pour ne pas interrompre le traitement des autres suivis. *(fichier : `src/modules/integration/services/msdp-service.ts`)*

### 2. Exports du module

- [x] **T4** — Exporter `runMsdpInactivityNotifications` et `buildMsdpInactivityEmail` depuis `src/modules/integration/index.ts`, aux côtés des exports existants de `msdp-service.ts`. *(fichier : `src/modules/integration/index.ts`)*

### 3. Intégration cron

- [x] **T5** — Dans `src/app/api/cron/route.ts`, importer `runMsdpInactivityNotifications` depuis `@/modules/integration` et l'ajouter au `Promise.all([...])` existant (aux côtés de `runReminders`, `runPlanningDigest`, `runInactivityNotifications`) ; exposer le résultat sous la clé `msdpInactivity` dans la réponse JSON. *(fichier : `src/app/api/cron/route.ts`)*

### 4. Tests

- [x] **T6** [P] — Test unitaire de `buildMsdpInactivityEmail` : vérifie que le HTML généré contient le nom de la personne suivie, un message contextualisé par statut, et le lien vers le suivi. *(fichier : `src/modules/integration/__tests__/msdp-service.test.ts`)*

- [x] **T7** [P] — Tests unitaires de `runMsdpInactivityNotifications` (mock Prisma via `src/__mocks__/prisma.ts`, mock `sendEmail` via `vi.mock("@/lib/email")`) :
  - Suivi `ASSIGNED` inactif 7+ jours avec conseiller assigné → notification créée + `sendEmail` appelé pour le conseiller.
  - Suivi `SUBMITTED` sans conseiller assigné, inactif → notification créée pour les membres du département `MSDP` de l'église (pas d'appel `sendEmail` individuel conseiller).
  - Filtre de statuts non terminaux vérifié via l'argument `where` du mock `msdpFollowUp.findMany` (`COMPLETED`/`ABANDONED` jamais dans la liste).
  - Suivi déjà notifié dans les 7 derniers jours (notification `MSDP_INACTIVITY` récente existante) → pas de nouvelle notification, `skipped` incrémenté.
  - `sendEmail` qui rejette pour un suivi → ne lève pas d'exception, les autres suivis du même appel sont bien traités (`notified` reflète les suivis traités avec succès).
  *(fichier : `src/modules/integration/__tests__/msdp-service.test.ts`)*
  Note d'implémentation : `prismaMock.msdpFollowUp` manquait dans `src/__mocks__/prisma.ts` — ajouté (nécessaire pour que ces tests s'exécutent).

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint` (0 erreur, 9 warnings préexistants sans rapport)
- [x] `npm run lint:boundaries` (518 modules, 0 violation)
- [x] `npm run test` (635/635)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [x] Suivi non terminal sans mise à jour depuis 7 jours déclenche une alerte au prochain cycle (T2, T5, T7)
  - [x] Alerte adressée au conseiller assigné, sinon à l'équipe MSDP/intégration (T3, T7)
  - [x] Alerte identifie la personne suivie, le délai écoulé, et le lien vers le suivi (T1, T6)
  - [x] Pas de nouvelle alerte tant que l'intervalle minimal n'est pas écoulé (T2, T7)
  - [x] Suivi terminé/abandonné jamais concerné (T2, T7)
  - [x] Mise à jour du suivi réinitialise le délai (couvert nativement par `updatedAt` — voir `plan.md` § Modèle de données, pas de tâche dédiée nécessaire)
  - [x] Exécution automatique sans action manuelle, alignée sur le cycle cron existant (T5)
  - [x] Échec d'envoi sur un suivi n'empêche pas le traitement des autres (T3, T7)
- [x] PR ouverte vers `main`
