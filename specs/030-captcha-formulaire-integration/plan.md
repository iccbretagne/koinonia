# Plan technique — Preuve d'humanité sur le formulaire public « Rejoindre une famille »

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun import cross-module ajouté ; la vérification vit dans
      `src/lib/` (utilitaire transverse, comme `rate-limit.ts`), consommé par deux routes
- [x] **Sécurité** : la route reste volontairement publique (formulaire sans compte, c'est sa
      raison d'être) ; elle gagne le contrôle anti-robot qui lui manquait, appliqué **avant** tout
      effet de bord. `churchId` continue d'être résolu et vérifié comme aujourd'hui
- [x] **Permissions** via `rolePermissions` — sans objet, endpoint public non authentifié
- [x] **Validation** Zod : le jeton entre dans le schéma existant de la mutation, comme sur le
      formulaire de rendez-vous
- [x] **Migration** Prisma : **aucune** — pas de changement de schéma
- [x] **Enums** depuis `@/generated/prisma/client` — inchangé
- [x] **UI** : aucun composant `src/components/ui/` à créer ; le widget est un `<div>` monté par
      le script Cloudflare, exactement comme sur le formulaire de rendez-vous

## Approche générale

Réplication à l'identique du mécanisme déjà éprouvé sur `/agenda-public/[churchSlug]`, avec une
seule différence : la fonction de vérification serveur, aujourd'hui définie **en local** dans la
route agenda, est extraite dans `src/lib/turnstile.ts` puisqu'elle acquiert un second
consommateur. La route agenda est modifiée pour l'importer, sans aucun changement de comportement.

Ordre d'exécution dans la route d'intégration — c'est lui qui porte le critère « aucun effet de
bord sur refus » : `requireRateLimit` → `schema.parse` → **vérification du jeton** → recherche de
l'église → contrôle du membre → géocodage → créations → email. Placer la vérification juste après
le `parse` garantit qu'un refus n'atteint ni le service de géolocalisation, ni la base, ni l'envoi
d'email.

## Modèle de données

`[Aucun changement]`.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/integration/requests` | POST | aucune (public, inchangé) | schéma existant **+** `turnstileToken: z.string().min(1, "Vérification CAPTCHA manquante")` | inchangée (`{ id, suggestedFamilyName }`, 201) |
| `/api/agenda/requests/public` | POST | aucune (public, inchangé) | inchangée | inchangée — seule l'origine de `verifyTurnstile` change (import au lieu de définition locale) |

Refus : `ApiError(400, "Vérification CAPTCHA échouée. Veuillez réessayer.")` — message et code
repris **mot pour mot** de la route agenda, conformément à la contrainte de la spec. Un jeton
absent est intercepté en amont par Zod, avec le message « Vérification CAPTCHA manquante ».

## Services / logique métier

- **`src/lib/turnstile.ts`** (nouveau) — accueille la fonction déplacée depuis la route agenda,
  à l'identique :
  ```ts
  export async function verifyTurnstile(token: string, ip: string): Promise<boolean>
  ```
  Comportement conservé tel quel, y compris le **fail-closed** : `TURNSTILE_SECRET_KEY` absent →
  `false`, donc soumission refusée. Ce choix est celui de la spec (§ cas limites) et n'est pas
  modifié ici ; il est simplement documenté dans le fichier pour qu'un futur lecteur ne le prenne
  pas pour un oubli.

- **`src/app/api/agenda/requests/public/route.ts`** — suppression de la définition locale de
  `verifyTurnstile` (lignes 29-39) au profit d'un import depuis `@/lib/turnstile`. Aucun autre
  changement : même appel, mêmes arguments, même traitement du résultat.

- **`src/app/api/integration/requests/route.ts`** — ajout de `turnstileToken` au schéma Zod de la
  mutation, puis, immédiatement après `schema.parse` :
  ```ts
  const valid = await verifyTurnstile(data.turnstileToken, getClientIp(request));
  if (!valid) throw new ApiError(400, "Vérification CAPTCHA échouée. Veuillez réessayer.");
  ```
  `getClientIp` est déjà importé dans cette route pour la clé de rate-limit — pas de nouvelle
  dépendance. Aucune autre ligne de la route n'est touchée.

## UI / composants

- **`src/app/rejoindre/[churchSlug]/page.tsx`** — lit `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  (avec repli `""`, comme la page agenda) et le passe en prop `turnstileSiteKey` à `JoinForm`.
- **`src/app/rejoindre/[churchSlug]/JoinForm.tsx`** — transposition du bloc déjà présent dans
  `PublicRequestForm.tsx` :
  - nouvelle prop `turnstileSiteKey: string` ;
  - état `turnstileToken` + `widgetRef`/`widgetId`, et le `useEffect` de montage du widget
    (chargement du script `challenges.cloudflare.com/turnstile/v0/api.js` s'il n'est pas déjà
    présent, puis `turnstile.render` avec les callbacks `callback` / `expired-callback` /
    `error-callback` — ces deux derniers remettant le jeton à `null`, ce qui satisfait le critère
    « refaire la vérification si elle expire ») ;
  - garde en tête de `handleSubmit` :
    `if (!turnstileToken) { setGlobalError("Veuillez compléter la vérification CAPTCHA."); return; }` ;
  - `turnstileToken` ajouté au corps de la requête ;
  - rendu : `<div ref={widgetRef} />` + la mention « Vérification anti-spam requise. » tant
    qu'aucun jeton n'est obtenu, placés au-dessus du bouton d'envoi ;
  - bouton d'envoi : `disabled={submitting || (!!turnstileSiteKey && !turnstileToken)}`.

  Le formulaire conserve son état de saisie lors d'un refus (la garde retourne sans réinitialiser
  `form`), ce qui satisfait le critère « sans perdre les informations déjà saisies ».

## Décisions & alternatives écartées

- **Choix : extraire `verifyTurnstile` dans `src/lib/` plutôt que la dupliquer** — *Pourquoi* :
  une seconde copie signifierait deux endroits à corriger le jour où le fournisseur, l'URL de
  vérification ou le traitement du fail-closed change — sur un contrôle de sécurité, c'est
  précisément le genre de divergence qui finit par laisser une route en arrière. `src/lib/` est le
  bon niveau : la fonction ne dépend d'aucun module métier et sert des routes de deux domaines
  différents (agenda et intégration).
- **Choix : vérifier juste après `schema.parse`, avant la recherche d'église** — *Pourquoi* : le
  critère d'acceptation exige qu'un refus ne déclenche ni géocodage, ni création, ni email. Placer
  le contrôle plus bas (par exemple après la résolution de l'église) le satisferait encore, mais
  ferait payer une requête base à chaque soumission robotisée sans bénéfice.
- **Écarté : rendre le contrôle optionnel quand `TURNSTILE_SECRET_KEY` est absent
  (fail-open)** — *Raison* : ce serait un interrupteur silencieux désactivant une protection de
  sécurité selon la configuration — exactement le genre de comportement qui passe inaperçu en
  production. La spec tranche explicitement pour le refus, et c'est déjà le comportement du
  formulaire de rendez-vous : diverger ici créerait deux règles pour un même mécanisme.
- **Écarté : protéger aussi `GET /api/integration/families/suggest`** — *Raison* : hors périmètre
  acté par la spec. Cet endpoint est appelé au fil de la frappe pour suggérer une famille ; y
  exiger un défi le rendrait inutilisable. Il ne crée rien et n'envoie pas d'email ; sa limite de
  débit (20/min par IP) reste sa seule protection, inchangée.
- **Écarté : introduire un composant UI partagé « widget Turnstile »** — *Raison* : deux
  occurrences d'un bloc dont le montage dépend d'un script tiers et de refs impératives ; un
  composant partagé serait défendable, mais la constitution demande de ne pas sur-ingénierer et
  les deux formulaires publics sont les seuls consommateurs prévisibles. La **vérification
  serveur** est mutualisée parce que c'est elle qui porte la sécurité ; le montage du widget reste
  local à chaque formulaire.

## Risques & points d'attention

- **Prérequis de déploiement (bloquant)** : `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et
  `TURNSTILE_SECRET_KEY` doivent être renseignées sur l'environnement cible **avant** la mise en
  ligne, sinon le formulaire d'intégration refusera toute soumission. Ces variables existent déjà
  pour le formulaire de rendez-vous et sont documentées dans `.env.example` — à confirmer
  explicitement sur recette puis sur production (tâche de vérification dédiée).
- **Environnement de développement local sans clés** : le formulaire d'intégration deviendra
  inutilisable en local tant que les clés ne sont pas renseignées, là où il fonctionnait
  jusqu'ici. Cohérent avec le formulaire agenda (même contrainte aujourd'hui), à signaler dans la
  PR pour ne pas surprendre.
- **Non-régression de la route agenda** : l'extraction de `verifyTurnstile` touche une route de
  production qui fonctionne. Le déplacement doit être strictement iso-comportement — aucune
  reformulation « au passage », vérifiée par les tests.
- **Faiblesse résiduelle assumée** : l'IP transmise à Cloudflare (`remoteip`) provient de
  `X-Forwarded-For`. Si le proxy ne réécrit pas cet en-tête, cette valeur est falsifiable. Cela
  n'affaiblit pas la vérification du jeton lui-même (le jeton reste vérifié par Cloudflare) ;
  c'est une limite connue, documentée en tête de `src/lib/rate-limit.ts` et hors périmètre.

## Stratégie de tests

- **`src/lib/__tests__/turnstile.test.ts`** (nouveau) — `fetch` global mocké :
  - `TURNSTILE_SECRET_KEY` absent → `false` **sans appel réseau** (verrouille le fail-closed, qui
    est la décision de sécurité la plus facile à casser par inadvertance) ;
  - réponse `{ success: true }` → `true` ;
  - réponse `{ success: false }` → `false` ;
  - le corps envoyé contient bien le secret, le jeton et l'IP.
- **`src/app/api/integration/requests/__tests__/captcha.test.ts`** (nouveau) — `@/lib/turnstile`
  et `@/lib/prisma` mockés, `geocodeAddress` et `sendEmail` mockés pour pouvoir affirmer qu'ils ne
  sont **pas** appelés :
  - corps sans `turnstileToken` → 400, aucune écriture Prisma, aucun géocodage, aucun email
    (le refus vient de Zod) ;
  - `verifyTurnstile` renvoyant `false` → 400 avec le message attendu, et les mêmes assertions
    d'absence d'effet de bord — c'est le test qui porte le critère central de la spec ;
  - `verifyTurnstile` renvoyant `true` → 201, création effectuée, parcours nominal préservé.
- **Non-régression agenda** : la route `/api/agenda/requests/public` n'a pas de test dédié
  aujourd'hui (les fichiers `__tests__` existants du domaine agenda couvrent `profiles`,
  `requests` et `entries` côté authentifié). L'extraction étant un pur déplacement, la garantie
  principale reste `npm run typecheck` plus la suite complète ; un test minimal de la route
  publique agenda (jeton invalide → 400) est ajouté **avec** cette spec pour que la mutualisation
  ne repose pas uniquement sur la relecture.
