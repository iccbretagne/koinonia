# Tâches — Email de notification à l'assignation d'un conseiller MSDP

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : services → API → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/email-assignation-conseiller-msdp`
- [x] Migration Prisma : `[Aucune]` — pas de changement de schéma (confirmé dans `plan.md`)

## Tâches

### 1. Logique métier (services)

- [x] **T1** — Ajouter `buildMsdpCounselorNotifEmail(params: { counselorName, personName, followUpId, appUrl }): string` dans `src/modules/integration/services/msdp-service.ts`, calquée sur `buildBergerNotifEmail` (`family-service.ts`) : même charte visuelle (bandeau `#5E17EB`), nom de la personne suivie, bouton CTA vers `${appUrl}/admin/integration/requests/{requestId}`, aucun détail sensible du parcours (couvre le critère d'acceptation « ton/structure cohérents » + « pas de détail sensible »). *(fichier : `src/modules/integration/services/msdp-service.ts`)*

- [x] **T2** — Étendre `notifyMsdpCounselorAssigned(params)` : ajouter `appUrl: string` à la signature ; récupérer `{ id, name, email }` du conseiller via `prisma.user.findUnique` après la création de la notification in-app (comportement in-app inchangé) ; si `counselor.email` est renseigné, appeler `sendEmail({ to, subject, html: buildMsdpCounselorNotifEmail(...) })` avec `.catch(() => {})` pour ne jamais faire échouer l'assignation. Importer `sendEmail` depuis `@/lib/email`. *(fichier : `src/modules/integration/services/msdp-service.ts`)* — couvre les critères « email envoyé en plus de la notif », « pas d'email si pas d'adresse », « échec email n'empêche pas l'assignation ».

- [x] **T3** — Vérifier que `requestId` (nécessaire pour le lien de l'email) est bien disponible dans `notifyMsdpCounselorAssigned` : actuellement seul `followUpId` et `personName` sont passés par l'appelant (`route.ts`) ; ajouter `requestId` aux params de la fonction si besoin pour construire le lien vers `RequestDetail`. *(fichier : `src/modules/integration/services/msdp-service.ts`)*

### 2. API (route handler)

- [x] **T4** — Dans `src/app/api/integration/msdp/[id]/route.ts`, calculer `appUrl` avant l'appel à `notifyMsdpCounselorAssigned` (même logique que `requests/[id]/route.ts:202` : `process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"`), et passer `appUrl` (+ `requestId` si ajouté en T3) dans l'appel existant à `notifyMsdpCounselorAssigned`. *(fichier : `src/app/api/integration/msdp/[id]/route.ts`)*

### 3. Tests

- [x] **T5** [P] — Test unitaire de `buildMsdpCounselorNotifEmail` : vérifie que le HTML généré contient le nom du conseiller, le nom de la personne suivie, et le lien vers l'application avec le bon `requestId`. *(fichier : `src/modules/integration/__tests__/msdp-service.test.ts`)*

- [x] **T6** [P] — Tests unitaires de `notifyMsdpCounselorAssigned` (mock Prisma via `src/__mocks__/prisma.ts`, mock `sendEmail` via `vi.mock("@/lib/email")`) :
  - Conseiller avec email renseigné → `sendEmail` appelé une fois, avec le bon destinataire et un sujet cohérent ; notification in-app toujours créée.
  - Conseiller sans email → `sendEmail` non appelé ; notification in-app toujours créée (couvre le critère « dégradation silencieuse »).
  - `sendEmail` qui rejette (mock rejeté) → la fonction ne lève pas d'exception, se termine normalement (couvre le critère « échec email n'empêche pas l'assignation »).
  *(fichier : `src/modules/integration/__tests__/msdp-service.test.ts`)*

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits :
  - [x] Email envoyé en plus de la notification in-app à l'assignation (T2, T4)
  - [x] Email identifie la personne suivie + lien direct vers le suivi (T1, T3)
  - [x] Absence d'email du conseiller → pas de blocage, notif in-app seule (T2, T6)
  - [x] Échec technique d'envoi → pas de blocage de l'assignation (T2, T6)
  - [x] Ton/structure/identité visuelle cohérents avec les emails existants du module (T1, T5)
- [ ] PR ouverte vers `main`
