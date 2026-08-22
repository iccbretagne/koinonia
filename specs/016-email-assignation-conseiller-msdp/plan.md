# Plan technique — Email de notification à l'assignation d'un conseiller MSDP

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-16

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import cross-module ; tout reste dans `src/modules/integration/` et sa route d'API dédiée `src/app/api/integration/msdp/[id]/route.ts`.
- [x] **Sécurité** : aucune route nouvelle, aucun changement de permission — `assign_counselor` reste réservé aux managers (`hasMsdpManagementAccess`), déjà vérifié dans le handler `PATCH` existant.
- [x] **Permissions** via `rolePermissions` : inchangé, pas touché par cette feature.
- [x] **Validation** Zod : pas de nouveau body/paramètre entrant, `msdpPatchSchema` inchangé.
- [x] **Migration** Prisma : `[Aucun changement]` — pas de nouveau champ ni modèle.
- [x] **Enums** : aucun enum ajouté/modifié.
- [x] **UI** : aucun composant UI ajouté — l'email est un template HTML inline, comme les emails existants du module (`family-service.ts`), pas un composant React.

## Approche générale

Répliquer exactement le pattern déjà utilisé pour la notification du berger (`notifyBergerAssigned` → `buildBergerNotifEmail`, dans `family-service.ts`) mais côté MSDP :

1. Ajouter une fonction `buildMsdpCounselorNotifEmail(...)` dans `msdp-service.ts`, générant un template HTML sobre calqué sur `buildBergerNotifEmail` (identité visuelle ICC, nom de la personne suivie, lien direct vers le suivi).
2. Étendre `notifyMsdpCounselorAssigned(...)` pour, en plus de créer la notification in-app existante, récupérer l'email du conseiller (`User.email`) et envoyer l'email via `sendEmail` si l'email est renseigné — exactement le garde-fou `if (berger.email) { ... }` déjà utilisé côté famille.
3. Passer un `appUrl` à `notifyMsdpCounselorAssigned` depuis la route API, dérivé de la même façon que dans `src/app/api/integration/requests/[id]/route.ts:202` (`process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"`).
4. Aucun changement de contrat d'API observable : la route `PATCH /api/integration/msdp/[id]` répond exactement comme avant, l'envoi d'email est un effet de bord asynchrone non bloquant (`.catch(() => {})`), au même titre que l'email berger.

## Modèle de données

`[Aucun changement]` — `User.email` existe déjà, `MsdpFollowUp` et `FamilyIntegrationRequest` ne sont pas modifiés.

## API

`[Aucun endpoint ajouté ni modifié dans son contrat]`

| Endpoint | Méthode | Permission | Changement |
|---|---|---|---|
| `/api/integration/msdp/[id]` | PATCH | `hasMsdpManagementAccess` (action `assign_counselor` déjà réservée manager) | Effet de bord supplémentaire non bloquant : email envoyé au conseiller assigné, en plus de la notification in-app déjà créée. Réponse HTTP inchangée. |

## Services / logique métier

Dans `src/modules/integration/services/msdp-service.ts` :

- **Nouvelle fonction** `buildMsdpCounselorNotifEmail(params: { counselorName: string; personName: string; followUpId: string; appUrl: string }): string` — template HTML, structure et style identiques à `buildBergerNotifEmail` (même charte : bandeau violet `#5E17EB`, encart avec le nom de la personne, bouton CTA vers `${appUrl}/admin/integration/requests/{requestId}` — à confirmer : le suivi MSDP n'a pas de page dédiée, on renvoie donc vers la fiche `RequestDetail` qui contient le bloc MSDP, comme c'est déjà le cas dans l'UI).
- **Modification** de `notifyMsdpCounselorAssigned(params)` :
  - Signature étendue : ajoute `appUrl: string` aux params existants (`counselorId`, `followUpId`, `personName`).
  - Après la création de la notification in-app (inchangée), récupère `{ id, name, email }` du conseiller via `prisma.user.findUnique`.
  - Si `counselor.email` est renseigné, appelle `sendEmail({ to, subject, html: buildMsdpCounselorNotifEmail(...) })`, avec `.catch(() => {})` pour ne jamais faire échouer l'assignation (cohérent avec le comportement déjà en place côté berger et avec le critère d'acceptation « un échec technique d'envoi d'email n'empêche pas l'assignation »).
  - Import ajouté : `sendEmail` depuis `@/lib/email` (déjà utilisé ailleurs dans le module, pas de nouvelle dépendance cross-module).

Dans `src/app/api/integration/msdp/[id]/route.ts` :

- Calcul de `appUrl` (même logique que `requests/[id]/route.ts:202`) juste avant l'appel à `notifyMsdpCounselorAssigned`, et ajout de `appUrl` à l'objet passé.

Aucun événement du bus (`integrationBus`) n'est émis ni consommé — cohérent avec le constat que le bus n'est pas utilisé aujourd'hui dans ce module ; l'ajouter ici serait hors périmètre de la spec.

## UI / composants

`[Aucun changement]` — l'email est un template HTML généré côté serveur, pas un composant. Aucune page ni composant `src/components/ui/` à toucher.

## Décisions & alternatives écartées

- **Choix** : dupliquer le pattern `buildBergerNotifEmail` tel quel (fonction générant une chaîne HTML dans le fichier `services/`) plutôt que de créer un système de templates d'email partagé. *Pourquoi* : cohérence avec l'existant (aucun système de templates générique n'existe dans le projet, chaque email a sa propre fonction `build*Email`), et périmètre de la spec limité à ce seul email — introduire une abstraction de templating serait de la sur-ingénierie pour un seul cas d'usage supplémentaire.
- **Choix** : lien de l'email pointant vers `RequestDetail` (`/admin/integration/requests/{requestId}`) plutôt qu'une URL MSDP dédiée. *Pourquoi* : il n'existe pas de page MSDP séparée (confirmé lors de l'exploration précédente) — le bloc MSDP est intégré dans la fiche de la demande d'intégration. Créer une route dédiée serait hors périmètre.
- **Écarté** : introduire une préférence utilisateur pour désactiver cet email. *Raison* : explicitement hors périmètre de la spec — aucun mécanisme de préférence de notification n'existe ailleurs dans l'application.
- **Écarté** : émettre un événement `integrationBus` (`msdp:counselor_assigned`) plutôt qu'un appel direct de fonction. *Raison* : le bus n'est utilisé nulle part ailleurs dans ce module actuellement ; l'introduire seulement pour cette feature ajouterait de la complexité sans bénéfice immédiat (pas de second abonné identifié).

## Risques & points d'attention

- **Confidentialité** : comme pour le flux famille, l'email évite tout détail sensible (pas de mention explicite « appel au salut » dans le corps, conformément au critère d'acceptation sur la sobriété) — juste le nom de la personne suivie et un lien vers l'application.
- **Échec silencieux** : `sendEmail(...).catch(() => {})` masque les erreurs d'envoi (SMTP down, etc.) sans les logger — c'est le comportement déjà accepté ailleurs dans le module (`family-service.ts`), donc pas une régression, mais un point de vigilance opérationnelle déjà existant, pas à corriger ici (hors périmètre).
- **SMTP non configuré en dev** : contrairement au job d'inactivité (`buildInactivityEmail`, qui vérifie `process.env.SMTP_HOST` avant d'envoyer), `notifyBergerAssigned` — le pattern suivi ici — n'a **aucune** garde `SMTP_HOST` : il tente toujours l'envoi si `berger.email` est renseigné, `sendEmail` utilisant `localhost` par défaut si `SMTP_HOST` est absent. On reproduit fidèlement ce comportement (pas de garde `SMTP_HOST` ajoutée pour MSDP) pour rester cohérent avec le seul pattern de référence pertinent — une notification d'assignation, pas un job planifié.

## Stratégie de tests

- **Test unitaire** sur `buildMsdpCounselorNotifEmail` : vérifie que le nom du conseiller, le nom de la personne suivie et le lien vers l'application apparaissent dans le HTML généré (même style de test que ceux existants pour `buildBergerNotifEmail`, si présents — sinon premier test de ce type pour le module).
- **Test unitaire** sur `notifyMsdpCounselorAssigned` (via mock Prisma déjà en place dans `src/__mocks__/prisma.ts`) :
  - Cas conseiller avec email → `sendEmail` appelé une fois avec les bons destinataire/sujet.
  - Cas conseiller sans email → `sendEmail` non appelé, notification in-app toujours créée.
  - Cas `sendEmail` qui rejette → la fonction ne lève pas, l'appelant (route PATCH) continue normalement.
- Pas de nouveau test d'intégration de route nécessaire : le comportement de `PATCH /api/integration/msdp/[id]` (statut HTTP, permissions) est inchangé ; les tests de sécurité existants (`src/app/api/agenda/requests/__tests__/security.test.ts` sert de référence de pattern) n'ont pas besoin d'évoluer pour cette feature.
