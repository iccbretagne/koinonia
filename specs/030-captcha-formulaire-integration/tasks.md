# Tâches — Preuve d'humanité sur le formulaire public « Rejoindre une famille »

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : service partagé → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/captcha-formulaire-integration`
- [x] Migration Prisma : **sans objet** (aucun changement de schéma)

## Tâches

### 1. Service partagé

- [x] **T1** — Créer `src/lib/turnstile.ts` exportant
      `verifyTurnstile(token: string, ip: string): Promise<boolean>`, par **déplacement à
      l'identique** de la fonction actuellement locale à la route agenda (lignes 29-39). Documenter
      dans le fichier que le fail-closed (`TURNSTILE_SECRET_KEY` absent → `false`) est un choix
      délibéré, pas un oubli. *(fichier : `src/lib/turnstile.ts`)*
- [x] **T2** — Retirer la définition locale de `verifyTurnstile` de la route agenda et l'importer
      depuis `@/lib/turnstile`. Aucun autre changement : même appel, mêmes arguments, même
      traitement du résultat. *(fichier : `src/app/api/agenda/requests/public/route.ts`)*

### 2. API

- [x] **T3** — Ajouter `turnstileToken: z.string().min(1, "Vérification CAPTCHA manquante")` au
      schéma Zod de la mutation, puis vérifier le jeton **immédiatement après `schema.parse`**
      (avant la recherche d'église, donc avant tout géocodage, création ou email) :
      `verifyTurnstile(data.turnstileToken, getClientIp(request))` → si `false`,
      `ApiError(400, "Vérification CAPTCHA échouée. Veuillez réessayer.")`. `getClientIp` est déjà
      importé dans cette route. Ne toucher à aucune autre ligne.
      *(fichier : `src/app/api/integration/requests/route.ts`)*

### 3. UI

- [x] **T4** — Lire `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` (repli `""`, comme la page
      agenda) et le passer en prop `turnstileSiteKey` à `JoinForm`.
      *(fichier : `src/app/rejoindre/[churchSlug]/page.tsx`)*
- [x] **T5** — Transposer le bloc widget de `PublicRequestForm.tsx` dans `JoinForm` : prop
      `turnstileSiteKey`, états `turnstileToken`/`widgetRef`/`widgetId`, `useEffect` de montage
      (chargement du script Cloudflare puis `turnstile.render` avec les callbacks `callback` /
      `expired-callback` / `error-callback`, ces deux derniers remettant le jeton à `null`), garde
      en tête de `handleSubmit`, `turnstileToken` ajouté au corps de la requête, `<div ref>` +
      mention « Vérification anti-spam requise. » au-dessus du bouton, et
      `disabled={submitting || (!!turnstileSiteKey && !turnstileToken)}` sur le bouton d'envoi.
      Ne pas réinitialiser `form` en cas de refus (la saisie doit être conservée).
      *(fichier : `src/app/rejoindre/[churchSlug]/JoinForm.tsx`)*

### 4. Tests

- [x] **T6** [P] — Tests de `verifyTurnstile` (`fetch` global mocké) : secret absent → `false`
      **sans appel réseau** ; `{ success: true }` → `true` ; `{ success: false }` → `false` ; le
      corps envoyé contient bien le secret, le jeton et l'IP.
      *(fichier : `src/lib/__tests__/turnstile.test.ts`)*
- [x] **T7** [P] — Tests du volet CAPTCHA de la route d'intégration (`@/lib/turnstile`,
      `@/lib/prisma`, `geocodeAddress` et `sendEmail` mockés) : corps sans `turnstileToken` → 400
      + aucune écriture Prisma, aucun géocodage, aucun email ; `verifyTurnstile` → `false` → 400
      avec le message attendu + les mêmes assertions d'absence d'effet de bord ; `verifyTurnstile`
      → `true` → 201 et parcours nominal préservé.
      *(fichier : `src/app/api/integration/requests/__tests__/captcha.test.ts`)*
- [x] **T8** [P] — Test minimal de non-régression de la route publique agenda après mutualisation
      (jeton invalide → 400), pour que l'extraction ne repose pas uniquement sur la relecture.
      *(fichier : `src/app/api/agenda/requests/__tests__/public-captcha.test.ts`)*

## Traçabilité critères d'acceptation → tâches

| Critère d'acceptation (spec.md) | Couvert par |
|---|---|
| Soumission sans preuve refusée | T3, T5, T7 |
| Soumission avec preuve invalide ou périmée refusée | T1, T3, T7 |
| Refus → aucune création, aucun email, aucun géocodage | T3 (ordre d'exécution), T7 |
| Soumission avec preuve valide aboutit comme aujourd'hui | T3, T7 |
| Vérification contrôlée côté serveur | T1, T3, T6, T7 |
| Vérification refaisable si expirée, sans perte de saisie | T5 (callbacks + garde sans reset) |
| Formulaire de rendez-vous inchangé | T2, T8 |

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] **Avant déploiement** : confirmer que `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et
      `TURNSTILE_SECRET_KEY` sont renseignées sur recette puis production — sans elles, le
      formulaire d'intégration refusera toute soumission (fail-closed volontaire)
- [ ] PR ouverte vers `main`
