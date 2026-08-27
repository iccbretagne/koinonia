# ADR-0007 — Worker hors Next.js, piloté par une table de jobs

- **Statut** : Proposé
- **Date** : 2026-08-23

## Contexte

Le traitement audio d'un culte (probe des sources, alignement des frontières,
rendu ffmpeg des séquences) peut prendre jusqu'à **deux heures** pour une
session de 2h53 en 48 kHz/16 bits/2 canaux. Un route handler Next.js ne peut
pas porter ce travail : timeout de la plateforme, mémoire du process serveur
partagée avec les requêtes web, et un déploiement qui tuerait un rendu en
cours.

Le dépôt a déjà un manque d'infrastructure connu : `ModuleManifest` déclare un
type `JobDescriptor`, mais **aucun runner ne l'exécute** aujourd'hui —
`MediaZipJob` existe en base sans code qui le consomme (le ZIP est streamé en
synchrone dans la route). Voir `specs/019-audio-cultes-publication/design.md`
§4 (D3).

## Décision

Un process **hors Next.js** (`npm run worker`), packagé comme unité systemd
distincte du serveur web, prend un bail sur une table `audio_jobs` via
`SELECT … FOR UPDATE SKIP LOCKED` (supporté par MariaDB 10.11). **La base de
données est le seul canal** entre l'application et le worker — pas de broker,
pas de queue externe. Chaque job porte un type (`PROBE`, `ALIGN`, `RENDER`,
`TRANSCRIBE`), un statut, une progression, un compteur de tentatives et un
`leasedUntil` qui permet la reprise après redémarrage du worker.

## Alternatives considérées

- **BullMQ / Redis** — *Écarté* : un service de plus en production pour un
  volume d'environ un job de rendu par semaine (un culte) ; coût
  d'infrastructure et d'exploitation disproportionné au débit réel.
- **Cron shell** — *Écarté* : ni progression visible, ni reprise après échec,
  ni remontée d'erreur structurée vers l'écran de validation de la régie.
- **Traitement dans la route Next.js** — *Écarté* : timeout de la plateforme
  sur un ffmpeg de deux heures, pression mémoire sur le process serveur, et un
  déploiement qui interromprait un rendu en cours sans mécanisme de reprise.

## Conséquences

- **Positif** : aucune dépendance d'infrastructure nouvelle (pas de Redis, pas
  de broker) — seule la base de données déjà en place est sollicitée. Le
  pattern `SELECT … FOR UPDATE SKIP LOCKED` généralise l'usage du
  `JobDescriptor` déjà déclaré dans `ModuleManifest` mais jamais exécuté,
  ouvrant la voie à ce que `MediaZipJob` s'y raccroche plus tard.
- **Négatif / contrainte** : un process de déploiement de plus à opérer (unité
  systemd distincte du serveur web), avec son propre cycle de redémarrage et
  sa propre surveillance de bail expiré (`leasedUntil`).
- **Point de vigilance** : le worker doit être robuste au redémarrage en plein
  job (reprise ou nouvelle tentative propre) — c'est la condition pour que
  `leasedUntil` tienne sa promesse de fiabilité sans supervision humaine.

## Amendement (2026-08-26) — packaging du worker

La décision initiale prévoyait que le worker s'exécute **directement depuis les sources via
`tsx`**, pour éviter un second pipeline de build. À l'usage, ce choix s'est révélé
incompatible avec le pipeline de déploiement : l'artefact produit par `deploy.yml` ne contient
que `.next/standalone` et n'embarquait donc pas `src/` — le worker était **indéployable**, le
serveur web (autosuffisant grâce au build standalone) masquant le problème. Ajouter `src/` +
`tsconfig.json` à l'archive fonctionnait mais imposait de conserver `tsx` (une
`devDependency`) en production, interdisant d'élaguer les dépendances de développement.

Le worker est désormais **bundlé par esbuild** (`npm run build:worker`, enchaîné par
`npm run build`) en un fichier unique `dist/worker.mjs`, avec `--packages=external` : le code
applicatif est inliné, les dépendances npm restent résolues depuis le `node_modules` de
production. Conséquences :

- Ni `src/` ni `tsx` ne sont déployés ; l'archive est élaguée (`npm prune --omit=dev`).
- La CLI `prisma` passe en `dependencies` — elle tourne réellement en production
  (`migrate deploy`), sa classification en `devDependency` était une erreur.
- **Le cœur de la décision est inchangé** : process hors Next.js, table `audio_jobs` comme
  seul canal, unité systemd distincte. Seul le mode de packaging est révisé.

Effet de bord bénéfique : le bundling a révélé que le worker tirait `next/server` (via
`ApiError` de `@/lib/api-utils`), ce qui contredisait le « hors Next.js » de cette décision et
**échouait au chargement en ESM pur**. `ApiError` a été extraite dans `@/lib/errors`, sans
dépendance au framework ; `api-utils.ts` la ré-exporte pour les route handlers.

## Amendement (2026-08-26) — le bail ne tenait pas sa promesse de reprise

Le « point de vigilance » ci-dessus (*le worker doit être robuste au redémarrage en plein
job*) n'était **pas** honoré par l'implémentation : `leaseNextJob` ne sélectionnait que
`status = 'PENDING'`. Un job laissé en `RUNNING` par un worker tué en plein rendu — cas
nominal à chaque redéploiement — n'était donc jamais repris par personne, quel que soit son
`leasedUntil`. Symptôme observé en recette : worker relancé et actif, aucun job traité, culte
figé indéfiniment sur « rendu en cours : 5/6 séquences prêtes », bouton « Publier » grisé.

Trois changements rendent la promesse effective :

- `leaseNextJob` reprend aussi les jobs `RUNNING` dont le bail a expiré.
- Le bail passe de 30 min à **5 min, renouvelé toutes les minutes** pendant le traitement
  (heartbeat). Il n'est plus dimensionné pour couvrir le plus long rendu imaginable : un bail
  expiré signifie désormais « le worker est mort », et non « le rendu est long » — c'est ce qui
  rend la reprise ci-dessus sûre pour plusieurs instances en parallèle.
- Le worker intercepte `SIGTERM`/`SIGINT` et remet son job courant en `PENDING` (avec
  `attempts` décrémenté : une interruption administrative n'est pas une tentative ratée), pour
  que le redémarrage reprenne immédiatement au lieu d'attendre l'expiration du bail.

**Le cœur de la décision est inchangé** : le mécanisme de bail sur `audio_jobs` reste le bon,
il était simplement incomplet. La leçon retenue est qu'un ADR qui promet une propriété de
fiabilité (« reprise après redémarrage ») mérite un test de bout en bout, ce que ce chemin
n'a pas — `runner.ts` exécute sa boucle à l'import et repose sur `FOR UPDATE SKIP LOCKED`,
donc sa vérification demande une vraie MariaDB, pas le mock Prisma.

## Références

- `specs/019-audio-cultes-publication/design.md` §4 D3, §5 (modèle `AudioJob`)
- `ModuleManifest` / type `JobDescriptor` (déclaré, non exécuté avant cette
  décision)
- `MediaZipJob` (job existant sans runner, cas voisin non traité ici)
