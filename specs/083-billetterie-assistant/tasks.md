# Tâches — Billetterie dans les assistants IA connectés

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : En cours

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : socle → lectures → actions → textes → tests. Les tâches `[P]` sont parallélisables.
> Découpage en sous-PR vers `feat/billetterie-assistant` (une par lot, voir plan « Livraison »).

## Prérequis

- [x] Branche créée : `feat/billetterie-assistant` (depuis `main`, PayPal inclus)
- [x] Pas de migration Prisma (aucun changement de schéma)

## Tâches

### Lot A — Socle et lectures (sous-PR 1)

- [x] **T1** — Déplacer `readinessChecks` (et `ReadinessCheck`) vers le module, exportés par
      `@/modules/ticketing/schemas` ; l'écran l'importe depuis là ; déplacer son test.
      *(fichiers : `src/modules/ticketing/readiness.ts`, `src/modules/ticketing/schemas.ts`,
      `src/app/(auth)/billetterie/[id]/_components/readiness.ts` (supprimé) et ses importeurs,
      `src/modules/ticketing/__tests__/readiness.test.ts`)*
- [x] **T2** [P] — `maskIban(iban)` → `FR76 •••• 1234`, placé avec les autres fonctions IBAN.
      *(fichier : `src/lib/iban.ts`)*
- [x] **T3** [P] — Contexte d'audit : `withAuditContext(extra, fn)` (`AsyncLocalStorage`) fusionné
      dans `details` par `logAudit`. *(fichier : `src/lib/audit.ts`)*
- [x] **T4** [P] — `consumeConfirmation(…, { erase: true })` vide le payload de la ligne consommée
      une fois lu ; export inchangé pour les appelants actuels.
      *(fichier : `src/modules/mcp/services/confirmations.ts`)*
- [x] **T5** — Constructeur `eventAction({ name, action, eventAction, input, prepare, state,
      execute, describe })` → paires `…_preview`/`…_confirm` : résolution de l'événement (id ou
      titre unique via `listEvents`), `getEventAccess(ctx.session, eventId)` + église = `ctx.churchId`,
      `canDo` à l'aperçu et à la confirmation, jeton, empreinte (`CHANGED`), `ApiError` → refus,
      `withAuditContext({ via: "mcp" })`, `erase: true`, sorties passées par `maskIban`, lien écran.
      *(fichier : `src/app/api/mcp/_actions/ticketing.ts`)*
- [x] **T6** — Lectures liées aux actions (`kind: "read"`) : `ticketing_event` (détail, IBAN
      masqué, identifiants, « Prêt à ouvrir ? »), `ticketing_bookings` (sans coordonnées,
      filtre nom/référence, pagination), `ticketing_presence`, `ticketing_catering`,
      `ticketing_accounts` (`configure`, nom seulement).
      *(fichier : `src/app/api/mcp/_actions/ticketing.ts`)*
- [x] **T7** [P] — Questions de données `ticketing.myEvents` et `ticketing.paymentsToHandle`
      (audience `predicates: ["ticketing"]`), ajoutées au catalogue et à `MCP_TOOLS`, fiches
      `donnees.ts` (D27, D28) et phrases d'évaluation.
      *(fichiers : `src/app/api/assistant/_data/ticketing.ts`,
      `src/app/api/assistant/_data-questions.ts`, `src/app/api/mcp/_tools.ts`,
      `src/modules/assistant/knowledge/donnees.ts`, `src/modules/assistant/knowledge/eval.ts`)*
- [x] **T8** — Brancher `TICKETING_ACTIONS` dans `MCP_ACTIONS` et l'export de l'index.
      *(fichier : `src/app/api/mcp/_actions/index.ts`)*
- [x] **T9** — Tests du lot A : `maskIban`, `withAuditContext` (avec et sans enveloppe),
      `erase`, constructeur (droit refusé, droit perdu avant confirmation, jeton expiré,
      empreinte changée ⇒ service non appelé, `ApiError` ⇒ refus, événement d'une autre église
      ⇒ introuvable, titre ambigu ⇒ liste des candidats), lectures (aucun email/téléphone/IBAN
      en clair), questions de données (rôles actifs, pas d'événement clôturé pour un non-manager).
      *(fichiers : `src/app/api/mcp/__tests__/ticketing-actions.test.ts`,
      `src/lib/__tests__/audit.test.ts`, `src/modules/mcp/services/__tests__/confirmations.test.ts`,
      `src/app/api/assistant/__tests__/…`)*

### Lot B — Créer et paramétrer (sous-PR 2)

- [x] **T10** — `create_ticketing_event` (`ticketing:manage` dans l'église ; `createEvent` ;
      aperçu : événement en brouillon et adresse publique).
- [x] **T11** — `update_ticketing_event` : corps partiel `eventUpdateSchema` sans `status`
      (infos, jauge, places, tarifs, moyens de paiement, règles) ; aperçu « avant → après » par
      champ, IBAN masqué ; empreinte `updatedAt`.
- [x] **T12** — `set_ticketing_status` (`open`/`close`/`reopen`/`archive`) : ouverture refusée si
      un point bloquant de `readinessChecks` ; clôture annonce la fin des rôles et la lecture seule.
- [x] **T13** — `edit_ticketing_option` (`op` create/update/delete) via
      `createOption`/`updateOption`/`deleteOption`.
- [x] **T14** — `edit_ticketing_dish` (`op` create/update/close/delete, droit `menu`) via
      `addVariant`/`updateVariant`/`deleteVariant`.
- [x] **T15** — Tests du lot B : parcours organisateur complet (créer → paramétrer → options →
      plats → ouvrir) par le seul assistant ; places sous les inscrits refusées ; ouverture avec
      point bloquant refusée ; IBAN jamais en clair dans aperçu ni résultat ; restauration peut
      éditer un plat mais pas l'événement.
      *(fichier : `src/app/api/mcp/__tests__/ticketing-actions.test.ts`)*

*(fichier des actions T10–T14 : `src/app/api/mcp/_actions/ticketing.ts`)*

### Lot C — Équipe (sous-PR 3)

- [x] **T16** — `set_ticketing_roles` (attribuer/retirer un rôle à un compte) : liste complète
      recalculée et montrée dans l'aperçu ; empreinte sur la liste existante ; `setRoles`.
- [x] **T17** — `edit_ticketing_post` (create/rename/delete) et `edit_ticketing_assignment`
      (create/update/delete, poste + créneau) via les services `team`.
- [x] **T18** — Tests du lot C : changement concurrent des rôles ⇒ `CHANGED` ; la personne
      affectée est notifiée comme à l'écran (service appelé, pas de notification en plus).

### Lot D — Paiements (sous-PR 4)

- [x] **T19** — `handle_ticketing_payments` : 1 à 50 identifiants, `confirm` ou `reject` (+ motif) ;
      aperçu : référence, nom, moyen, montant ; empreinte sur `id`/`status`/`amount` ; tout ou rien.
- [x] **T20** — `record_ticketing_receipt` (espèces, chèque) et `mark_ticketing_refunded`.
- [x] **T21** — Tests du lot D : série de 3 confirmée en une fois ; un paiement déjà traité ⇒ rien
      n'est fait ; > 50 ⇒ refus ; trésorier autorisé, accueil et observateur refusés.

### Lot E — Réservations, restauration, textes (sous-PR 5)

- [x] **T22** — `cancel_ticketing_booking` (`configure`, `cancelByOrganizer`) ; aperçu avec les
      remboursements qui en découlent.
- [x] **T23** — `add_ticketing_walkin` (`reception`, refusé si l'ajout sur place n'est pas permis).
- [x] **T24** — `ticketing_catering_sale` (remise d'un article, vente sur place ; `catering`).
- [x] **T25** — Test de la matrice des rôles : chaque action × organisateur / trésorier / accueil /
      restauration / observateur / sans rôle / STAR sans aucun rôle ⇒ conforme à `EVENT_ACTIONS`.
- [x] **T26** [P] — Libellés des actions dans `ACTION_LABELS` (instructions du serveur) ; mise à
      jour de `server.test.ts` / `tools.test.ts`. *(fichier : `src/app/api/mcp/server/route.ts`)*
- [x] **T27** [P] — Textes utilisateur : page Assistants IA connectés, `GuideContent.tsx`, fiche
      KB-111 et fiches billetterie d'`espaces.ts`.
- [x] **T28** [P] — Documentation : `docs/auth.md` (section MCP, levée de l'exclusion financière
      pour la billetterie), « Hors périmètre » de `specs/081-serveur-mcp/spec.md` → renvoi à 083,
      CHANGELOG « Non publié ».

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] `npm run openapi` sans différence (aucune route ajoutée)
- [ ] Critères d'acceptation de `spec.md` :
  - parcours organisateur complet par l'assistant → T10–T17, T15
  - actions proposées selon le rôle d'événement → T5, T25
  - STAR sans rôle : aucune action → T25
  - série de « J'ai payé » + emails habituels → T19, T21
  - confirmation refusée si droits/données changés, série comprise → T5, T9, T18, T21
  - ouverture refusée avec point bloquant → T12, T15
  - jamais d'email/téléphone d'un participant → T6, T9
  - IBAN jamais en clair → T2, T4, T11, T15
  - journalisé « via l'assistant IA » → T3, T5, T9
  - après clôture : équipe ne voit plus, organisateur en lecture seule → T7, T9, T12
- [ ] Spec et plan passés en « Implémentée » / « Validé »
- [ ] PR finale `feat/billetterie-assistant` → `main`
