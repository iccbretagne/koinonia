# Plan technique — Message récapitulatif des offres au format WhatsApp

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module. Le composeur du message est
      **colocalisé** dans `src/app/(auth)/jobs/`, pas dans `@/modules/jobs` (justification ci-dessous).
- [x] **Sécurité** : aucune route API ajoutée. Les données sont déjà chargées côté client par
      `src/app/(auth)/jobs/page.tsx`, dont la garde (`auth()` + `redirect("/")`) reste inchangée.
      Aucun élargissement de périmètre : le message ne peut contenir que ce que la page a déjà servi.
- [x] **Permissions** : inchangées. Aucune permission ajoutée, aucun appel à `rolePermissions`
      nécessaire — la spec tranche que l'accès à la section suffit.
- [x] **Validation Zod** : sans objet, aucune mutation (fonctionnalité en lecture seule, aucun
      appel réseau).
- [x] **Migration Prisma** : sans objet, le schéma ne change pas.
- [x] **Enums** : sans objet côté Prisma. Le type `JobType` du client est déjà déclaré localement
      dans `JobsListClient.tsx` (existant, non modifié).
- [x] **UI** : réutilisation de `src/components/ui/Modal.tsx` (prop `open`) et
      `src/components/ui/Button.tsx` (pas de prop `loading`) pour le repli. Aucun composant UI créé.

## Approche générale

La page `/jobs` est déjà un Server Component qui charge les offres publiées et les passe en props à
`JobsListClient` (Client Component), lequel applique le filtre de type **en mémoire** :

```ts
const filtered = filter === "ALL" ? jobs : jobs.filter((j) => j.type === filter);
```

Le tableau `filtered` **est** l'écran. Composer le message revient donc à le sérialiser en texte :
aucun aller-retour réseau, aucune route, aucune requête. C'est le même principe structurel que
l'export des demandes d'intégration (spec 033) — on part du tableau qui sert au rendu, pas d'une
seconde implémentation du filtre qui pourrait diverger — mais en plus simple, puisqu'ici rien ne
quitte le navigateur : il n'y a pas de serveur à qui re-prouver le périmètre.

Trois pièces :

1. **Un composeur pur** `buildWhatsAppRecap(jobs, filter, origin) → string`, sans aucun import, donc
   testable en environnement `node`.
2. **Un bouton** dans `JobsListClient`, affiché seulement si `filtered.length > 0`.
3. **Un repli** : si le presse-papier est indisponible ou refuse, le texte s'affiche dans une
   `Modal` avec une zone sélectionnable.

## Modèle de données

`[Aucun changement]` — ni modèle, ni champ, ni migration. La fonctionnalité lit des données déjà
sérialisées et transmises à la page.

## API

`[Aucun endpoint]`.

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| — | — | — | — | — |

Le refus d'ajouter une route est un choix, pas un oubli — voir « Décisions & alternatives écartées ».

## Services / logique métier

### `src/app/(auth)/jobs/whatsapp-recap.ts` *(nouveau)*

Module **pur, sans aucun import**, sur le modèle de `src/app/(auth)/rooms/calendar.ts` (spec 032).

```ts
export type RecapJobType = "EMPLOI" | "STAGE" | "ALTERNANCE";

export interface RecapJob {
  id: string;
  title: string;
  type: RecapJobType;
  company: string;
  location: string | null;
  deadline: string | null;   // ISO, tel que sérialisé par page.tsx
}

/** Compose le message WhatsApp à partir des offres AFFICHÉES (déjà filtrées). */
export function buildWhatsAppRecap(
  jobs: RecapJob[],
  filter: RecapJobType | "ALL",
  origin: string
): string;
```

**Structure produite** (conforme à la spec) :

```
📋 {en-tête selon le filtre} — {n} {nom}{s} disponible{s}

*{titre}*
{Type} · {entreprise}[ · {lieu}]
[À postuler avant le {jour} {mois}]
{origin}/jobs/{id}

… (bloc suivant, séparé par une ligne vide)

👉 Toutes les offres : {origin}/jobs
```

Points de conception :

- **En-tête dépendant du filtre** : table de correspondance
  `ALL → "Offres d'emploi" / "offre"`, `EMPLOI → "Emplois" / "offre"`,
  `STAGE → "Stages" / "stage"`, `ALTERNANCE → "Alternances" / "alternance"`. Le pluriel s'accorde
  sur `jobs.length`.
- **Lignes optionnelles omises** : `location` absent → le segment ` · {lieu}` disparaît ;
  `deadline` absent → la ligne entière disparaît. Aucun « non renseigné », aucun séparateur orphelin.
- **Neutralisation des astérisques du titre** : `title.replace(/\*/g, "")`. Un titre contenant `*`
  casserait le gras WhatsApp sur tout le reste du message. Une ligne, elle évite un rendu
  aberrant chez le destinataire (critère « pas de balisage non interprété »).
- **Date limite** : `new Date(deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })`
  — volontairement le **même appel** que `JobCard` (à `month` près, `"short"` sur la carte). Le
  message affiche donc la même date que l'écran, y compris son biais de fuseau éventuel : on n'en
  introduit pas un nouveau, on n'en corrige pas un existant dans cette feature.
- **Aucune coordonnée** : `contactEmail` / `contactUrl` ne sont jamais lus par le composeur. Le
  type `RecapJob` ne les déclare même pas — l'omission est structurelle, pas une discipline
  à tenir.

### Pourquoi pas dans `@/modules/jobs` ?

`src/modules/jobs/index.ts` réexporte `runJobOffersLifecycle` depuis `./services/lifecycle-service`,
qui importe `@/lib/prisma`. Un Client Component qui importerait `@/modules/jobs` tirerait Prisma
dans le bundle navigateur. La colocalisation dans `src/app/(auth)/jobs/` est le même arbitrage,
pour la même raison, que `src/app/(auth)/rooms/calendar.ts` en spec 032 — et elle respecte la
frontière I de la constitution, qui interdit d'importer un **chemin interne** de module, pas de
garder du code de présentation dans `src/app/`.

Second motif : `vitest.config.ts` cible `include: ["src/**/*.test.ts"]` en `environment: "node"` —
les `.tsx` ne sont pas collectés. Toute logique laissée dans `JobsListClient.tsx` serait
**non testable** en l'état. L'extraction est ce qui rend les critères d'acceptation vérifiables
automatiquement.

## UI / composants

### `src/app/(auth)/jobs/JobsListClient.tsx` *(modifié)*

Ajouts, ~35 lignes :

```tsx
const [copied, setCopied] = useState(false);
const [fallbackText, setFallbackText] = useState<string | null>(null);

async function copyRecap() {
  const text = buildWhatsAppRecap(filtered, filter, window.location.origin);
  try {
    if (!navigator.clipboard) throw new Error("presse-papier indisponible");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  } catch {
    setFallbackText(text);   // repli : Modal sélectionnable
  }
}
```

- **Garde explicite `if (!navigator.clipboard)`** : en contexte non sécurisé, `navigator.clipboard`
  vaut `undefined` ; un `?.writeText()` renverrait `undefined` et l'`await` **ne lèverait pas** —
  la confirmation « Copié ! » s'afficherait alors qu'aucune copie n'a eu lieu. La garde est ce qui
  fait tenir le critère de repli.
- **Placement** : à droite de la barre d'onglets de type, sur la même ligne. Le bouton est ainsi
  visuellement rattaché au filtre dont il dépend — l'utilisateur voit ce qu'il copie.
- **Rendu conditionnel** : `{filtered.length > 0 && <button …>}`. La liste vide affiche déjà son
  propre bloc « Aucune offre pour le moment » ; le bouton n'y apparaît pas.
- **Libellé et retour visuel** : « Copier pour WhatsApp » → « Copié ! (N offres) » pendant 2,5 s,
  sur le modèle de `PublicUrlBanner.tsx` / `PublicFormBanner.tsx` (même idiome `copied` +
  `setTimeout`), en réutilisant l'icône presse-papier déjà employée par ces bannières.
- **Repli** : `<Modal open={!!fallbackText} onClose={() => setFallbackText(null)} title="Copier le message">`
  contenant une phrase d'explication, un `<textarea readOnly>` (sélectionné automatiquement au
  montage via `autoFocus` + `onFocus={(e) => e.currentTarget.select()}`) et un `Button` de
  fermeture. Rappel du piège connu : la prop est `open`, pas `isOpen`.

Aucun autre fichier applicatif n'est touché : ni `page.tsx` (les champs nécessaires — `id`, `title`,
`type`, `company`, `location`, `deadline` — sont déjà sérialisés et passés en props), ni
`JobsTabBar.tsx`, ni les onglets Freelance / Recherche d'emploi.

## Décisions & alternatives écartées

- **Choix** : composer le message **côté client**, à partir de `filtered` — *Pourquoi* : c'est
  littéralement le tableau utilisé pour le rendu, donc « le message = l'écran » est une garantie
  structurelle et non une convention à maintenir. Zéro requête, zéro latence, zéro surface d'attaque.
- **Écarté** : une route `POST /api/jobs/recap` qui composerait le texte côté serveur — *Raison* :
  aller-retour réseau pour des données déjà présentes dans le navigateur, plus une route à protéger,
  un schéma Zod et une re-vérification de périmètre, le tout pour un résultat identique. La
  différence avec l'export Excel (spec 033), qui **est** une route serveur, tient à ce qu'un fichier
  `.xlsx` exige une génération serveur : ici la sortie est du texte brut.
- **Écarté** : l'API Web Share (`navigator.share`), suggérée par l'issue #464 — *Raison* : support
  inégal (quasi absente sur les navigateurs de bureau), exige un contexte sécurisé et un geste
  utilisateur, et ouvre une feuille de partage système que l'utilisateur ne veut pas forcément. Le
  presse-papier couvre mobile **et** bureau par un seul chemin, et laisse l'utilisateur relire son
  message avant de l'envoyer. Ajoutable plus tard en complément sans rien remettre en cause.
- **Écarté** : un lien profond `https://wa.me/?text=…` — *Raison* : impose WhatsApp (la spec veut un
  texte collable où l'utilisateur veut), se heurte aux limites de longueur d'URL dès quelques
  offres, et court-circuite la relecture avant envoi.
- **Écarté** : placer `buildWhatsAppRecap` dans `@/modules/jobs` — *Raison* : l'index du module
  réexporte un service qui importe `@/lib/prisma`, ce qui embarquerait Prisma dans le bundle
  navigateur (voir ci-dessus).
- **Écarté** : factoriser « copier avec repli » en hook partagé pour les 5 appels existants à
  `navigator.clipboard` du repo — *Raison* : hors périmètre de cette feature ; aucun de ces appels
  ne gère l'échec aujourd'hui (`.then()` sans `.catch()`), les corriger est une dette à traiter
  séparément. Noté comme suite possible, pas fait ici.
- **Choix** : `window.location.origin` comme base des liens — *Pourquoi* : donne l'origine
  publique réellement servie (staging comme production) sans introduire de variable
  d'environnement `NEXT_PUBLIC_*` ni dépendre de `APP_URL`, qui n'est aujourd'hui lu que côté
  serveur.

## Risques & points d'attention

- **Fuseau horaire sur la date limite** : `toLocaleDateString` sur une date ISO UTC peut afficher la
  veille dans un fuseau en retard sur UTC. Le comportement est **identique à celui de la carte
  d'offre** : le message ne ment pas par rapport à l'écran. Corriger ce biais dépasse cette feature
  (il faudrait trancher la sémantique de `deadline` : instant ou date civile).
- **Longueur du message** : sans plafond (arbitrage tranché), une liste longue produit un message
  que WhatsApp replie derrière « Lire la suite ». Assumé : l'utilisateur module le volume par le
  filtre de type, et tronquer en silence contredirait le principe du récapitulatif.
- **Contexte non sécurisé** : en HTTP simple (poste de développement sur IP réseau, par exemple),
  `navigator.clipboard` est absent. Le repli est précisément là pour ce cas, et c'est le scénario
  à vérifier en recette.
- **Rendu WhatsApp du gras** : `*texte*` n'est interprété que si l'astérisque colle au mot. Les
  titres sont insérés sans espace parasite, et les astérisques internes sont retirés.
- **Couverture Vitest** : `coverage.include` ne couvre que `src/lib/**`, `src/app/api/**` et
  `src/modules/**` ; les tests de `whatsapp-recap.ts` s'exécutent bien mais ne comptent pas dans
  les seuils. Sans effet sur le cliquet anti-régression (aucune ligne ajoutée dans le périmètre
  mesuré non plus).

## Stratégie de tests

**`src/app/(auth)/jobs/whatsapp-recap.test.ts`** *(nouveau)* — tests unitaires Vitest sur le
composeur pur, un par critère d'acceptation vérifiable automatiquement :

1. Message complet pour 3 offres sans filtre : en-tête, 3 blocs, pied de message.
2. Filtre `STAGE` : l'en-tête annonce des stages, seules les offres transmises apparaissent.
3. Ordre préservé : les offres sortent dans l'ordre du tableau d'entrée.
4. Chaque bloc contient type, intitulé, entreprise et `origin/jobs/{id}`.
5. `location: null` → aucun segment lieu, aucun ` · ` orphelin, aucun « non renseigné ».
6. `deadline: null` → aucune ligne de date ; `deadline` renseignée → date en français dans le bloc.
7. Aucune coordonnée : un objet portant `contactEmail`/`contactUrl` ne les voit jamais ressortir
   dans le texte produit.
8. Pluriel de l'en-tête : 1 offre au singulier, 2 offres au pluriel.
9. Titre contenant `*` : les astérisques du titre sont retirés, le gras du bloc reste équilibré.
10. Liste vide : le composeur n'est jamais appelé par l'UI, mais son comportement est verrouillé
    (chaîne sans bloc d'offre) pour éviter une régression silencieuse si l'appel changeait.

Les dates de test sont construites avec le constructeur **local** (`new Date(2026, 8, 15)`) puis
converties en ISO, comme dans `src/app/(auth)/rooms/calendar.test.ts` (spec 032), afin que la suite
passe quel que soit le fuseau de la machine ou de la CI.

**Non couvert par des tests automatisés** (recette manuelle, cf. `tasks.md`) : la copie effective
dans le presse-papier, le repli en contexte non sécurisé, et le rendu réel du message collé dans
WhatsApp. Aucun test de composant React n'existe dans le repo (pas de `jsdom`, pas de Testing
Library) : en introduire pour cette feature serait un chantier d'outillage sans rapport avec elle.
