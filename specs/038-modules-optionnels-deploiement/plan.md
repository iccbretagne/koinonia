# Plan technique — Modules optionnels par déploiement

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-08

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import `src/app/` → module. Le nouveau code de
      composition vit dans `src/lib/` (racine de composition) et n'importe que les **manifestes**
      (`@/modules/X/manifest`, ADR-0011), jamais les index. `src/core/` reste framework-agnostic :
      l'algorithme de résolution de préfixe y vit sans connaître aucun module (règle
      `core-no-modules-import` respectée).
- [x] **Sécurité** : aucune garde existante n'est affaiblie. Le filtre de module s'ajoute **en
      amont** de `requireAuth` / `requireChurchPermission`, il ne s'y substitue pas. Aucun
      `churchId` ne devient optionnel.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) : inchangé. La matrice se réduit
      déjà mécaniquement aux modules actifs (`buildRolePermissions(registry)`).
- [x] **Validation** Zod : sans objet, aucune mutation ajoutée.
- [x] **Migration** Prisma : sans objet, **aucun changement de schéma**.
- [x] **Enums** depuis `@/generated/prisma/client` : sans objet.
- [x] **UI** : une seule page ajoutée (relais de rendu 404), sans composant nouveau.
- [ ] **ADR** : ce plan introduit une décision structurante (déclaration des routes dans le
      manifeste + point de contrôle unique dans le proxy). **ADR-0012 est à écrire dans le même
      lot** — voir « Décisions » ci-dessous. Case laissée décochée tant qu'il n'existe pas.

## Approche générale

Le fil directeur est de créer **un point de contrôle unique, en amont de toute notion
d'identité**, et de faire du manifeste de module la source de vérité de ce qu'il expose.

Trois mouvements, dans cet ordre :

1. **Déclarer.** Chaque manifeste remplit le champ `routes` (`authenticated` / `public` / `api`)
   qui existe déjà dans `ModuleManifest` et que **personne ne remplit**. Une liste `NOYAU_ROUTES`
   explicite couvre ce qui n'appartient à aucun module (authentification, santé, cron, accueil).
   Un test d'exhaustivité échoue si un `route.ts` ou une `page.tsx` n'est revendiqué ni par un
   module ni par le noyau — c'est le mécanisme qui empêche le défaut de se réintroduire.
2. **Fermer.** `src/proxy.ts` devient le point de contrôle : il résout le chemin demandé au
   **préfixe le plus long**, et si le module propriétaire n'est pas actif, répond « introuvable ».
   Cela couvre d'un seul geste les cinq trous constatés — Super Admin, replis sur l'appartenance,
   modules sans permission, liens publics par jeton, liste blanche codée en dur — parce que le
   contrôle a lieu **avant** que la moindre garde ne soit consultée. Corollaire obligatoire : le
   `matcher` statique doit être élargi à toute l'application.
3. **Conditionner ce qui ne passe pas par une requête.** Le cron et les abonnements du bus ne
   traversent pas le proxy : ils sont conditionnés explicitement par `registry.has(...)`, en
   appliquant la règle de la spec — **nettoyer oui, créer non**.

Rien n'est retiré du code ni du schéma : une instance sans audio embarque toujours le module
audio, ses tables et ses données ; elle ne l'expose simplement plus.

## Modèle de données

**[Aucun changement]** — pas de modèle, pas de champ, pas de migration. La désactivation est un
paramètre de mise en service (`ENABLED_MODULES`), lu au démarrage du process.

## API

**Aucun endpoint ajouté, modifié ou supprimé.** Ce qui change est le comportement du proxy en
amont de tous les endpoints existants :

| Chemin demandé | Module actif | Module inactif |
|---|---|---|
| `/api/**` revendiqué par un module | comportement actuel inchangé | `404 { "error": "Not found" }` |
| Page revendiquée par un module | comportement actuel inchangé | réécriture interne vers le relais 404 (statut 404, URL inchangée) |
| Route publique par jeton d'un module (`/api/audio/public/…`, `/api/media/gallery/…`, `/ecouter/[token]`, `/rejoindre/…`, `/api/agenda/requests/public`) | passe sans session, comme aujourd'hui | `404` — **avant** toute vérification de jeton |
| Route du noyau (`/api/auth/**`, `/api/health`, `/api/cron`, `/`, `/no-access`) | toujours servie | toujours servie |
| Chemin revendiqué par personne | — | échoue **en CI**, pas en production (test d'exhaustivité) |

Le choix de `404` plutôt que `403` est acté dans la spec : `403` révèle l'existence de la
fonctionnalité.

## Services / logique métier

### Nouveaux fichiers

| Fichier | Rôle | Contraintes d'import |
|---|---|---|
| `src/core/module-routes.ts` | Algorithme pur : construit une table de préfixes à partir d'une liste de manifestes + d'une liste noyau, et résout un chemin au **préfixe le plus long**. Retourne `{ owner: string \| null, kind: "module" \| "noyau" \| "orphan" }`. Zéro import de module, zéro Next, zéro Prisma. | soumis à `core-no-modules-import` |
| `src/lib/manifests.ts` | Le tableau des 11 manifestes, importés depuis `@/modules/X/manifest` (ADR-0011). Devient la source unique consommée par `src/lib/registry.ts` **et** par la table de routes. | n'importe **que** des manifestes |
| `src/lib/module-routes.ts` | Racine de composition légère : `NOYAU_ROUTES`, construction de la table à partir de `manifests.ts` filtrés par `ENABLED_MODULES`, et export `resolveRouteOwner(pathname)` / `isPathEnabled(pathname)`. **N'importe pas `src/lib/registry.ts`** — donc ni Prisma, ni NextAuth, ni S3. | importable depuis `src/proxy.ts` |
| `src/app/module-absent/page.tsx` | Relais de rendu : appelle `notFound()`. Cible de la réécriture du proxy pour les pages, afin d'obtenir un vrai statut 404 avec l'habillage de l'application. Revendiqué par le noyau. | — |
| `src/app/not-found.tsx` | Page 404 globale de l'application (aujourd'hui celle par défaut de Next). | — |

### Fichiers modifiés

- **`src/core/boot.ts`** — trois validations ajoutées, toutes *fail-fast* :
  1. le module **racine** (`core`) doit être présent dans la liste → sinon throw nommant la règle ;
  2. un nom présent dans `ENABLED_MODULES` mais inconnu du tableau des manifestes → throw
     (une faute de frappe désactive silencieusement un module aujourd'hui) ;
  3. la validation de dépendances existante est conservée telle quelle (elle nomme déjà la
     dépendance manquante, comme l'exige la spec).
  Ajout d'un journal d'une ligne au démarrage listant les modules actifs (réponse à la question
  ouverte « comment l'exploitant vérifie-t-il ? »).
- **`src/proxy.ts`** — le contrôle de module s'exécute **en premier**, avant la lecture du cookie
  de session. La liste blanche codée en dur des routes publiques est **remplacée** par une
  dérivation de `routes.public` des manifestes actifs : la connaissance de « quelles adresses de
  ce module sont ouvertes sans session » retourne dans le module. `config.matcher` est élargi.
- **`src/lib/registry.ts`** — importe désormais `manifests.ts` ; les deux abonnements du bus sont
  conditionnés (voir ci-dessous). L'import de `planningBus` depuis `@/modules/planning` reste,
  c'est la racine de composition.
- **`src/app/api/cron/route.ts`** — les imports de `@/modules/integration` et `@/modules/jobs`
  deviennent dynamiques et conditionnés par `registry.has("integration")` / `registry.has("jobs")`.
  `/api/cron` reste une route **du noyau** : elle répond toujours, elle n'exécute que les travaux
  des modules actifs.
- **`src/app/(auth)/layout.tsx`** — deux ajustements (voir « Parcours aucun accès »).

### Abonnements du bus : nettoyer oui, créer non

`src/lib/registry.ts` enregistre aujourd'hui deux abonnements **sans condition**. La spec les
sépare explicitement :

| Abonnement | Décision | Raison |
|---|---|---|
| `planning:event:cancelled` → `tx.discipleshipAttendance.deleteMany` | **jamais conditionné** — reste actif même sans le module discipleship | Les lignes existent en base indépendamment de l'affichage. Le conditionner ferait échouer la suppression d'un événement sur une contrainte FK, sur une instance où l'exploitant croit ne pas avoir de discipolat. C'est **l'unique exception** nommée par la spec. |
| `planning:request:status_changed` → `tx.mediaProject.create` | **conditionné** par `registry.has("media")` | Créer une donnée d'un module absent. |

Cette asymétrie doit être commentée dans le code, sinon elle passera pour une incohérence à la
première relecture.

### Granularité de déclaration

Résolution au **préfixe le plus long** : `/api/admin` est réparti entre trois propriétaires, la
règle plus spécifique gagne. Répartition retenue (33 segments d'API, 19 sections de pages
authentifiées, 4 pages publiques) :

| Propriétaire | Préfixes API | Pages |
|---|---|---|
| **noyau** | `/api/auth`, `/api/health`, `/api/cron`, `/api/current-church`, `/api/user` | `/`, `/no-access`, `/module-absent` |
| **core** | `/api/churches`, `/api/users`, `/api/members`, `/api/ministries`, `/api/departments`, `/api/audit-logs`, `/api/onboarding`, `/api/notifications`, `/api/member-user-links`, `/api/member-link-requests`, `/api/admin/members`, `/api/admin/backups` | `/profile`, `/guide`, `/admin` (sauf sous-sections ci-dessous) |
| **planning** | `/api/planning`, `/api/events`, `/api/absences`, `/api/announcements`, `/api/requests`, `/api/welcome-duty` | `/dashboard`, `/planning`, `/events`, `/absences`, `/requests`, `/secretariat`, `/communication` |
| **discipleship** | `/api/discipleships` | `/admin/discipleship` |
| **media** | `/api/media`, `/api/media-events`, `/api/media-projects`, `/api/admin/media` | `/media` (auth), `/media` (public) |
| **audio** | `/api/audio` | `/audio`, `/ecouter` (public) |
| **agenda** | `/api/agenda` | `/agenda`, `/pastoral`, `/agenda-public` (public) |
| **rooms** | `/api/rooms`, `/api/room-reservations` | `/rooms`, `/admin/rooms` |
| **integration** | `/api/integration` | `/integration`, `/rejoindre` (public) |
| **accounting** | `/api/accounting` | `/accounting` |
| **jobs** | `/api/jobs` | `/jobs` |
| **storage** | *(aucun)* — infrastructure pure, sans surface HTTP | *(aucune)* |

Cette table est le **contenu** à écrire dans les champs `routes` des manifestes ; elle n'est pas
une constante centrale. `NOYAU_ROUTES` est la seule liste centralisée, et elle est courte par
construction : tout ce qui n'y figure pas doit trouver un module.

## UI / composants

- `src/app/not-found.tsx` : page 404 globale, aux couleurs de l'application, sans composant
  nouveau (réutilise le style de `src/app/no-access/`). Elle sert aussi bien les 404 ordinaires
  que celles produites par cette fonctionnalité — rien ne distingue les deux, c'est voulu.
- `src/app/module-absent/page.tsx` : trois lignes, appelle `notFound()`.
- **Aucun écran d'administration des modules** (hors périmètre spec).

### Parcours « aucun accès »

Deux points cassent sur une instance réduite, et se règlent dans `src/app/(auth)/layout.tsx` :

1. **La redirection d'atterrissage** (ligne 67) pointe en dur sur `/dashboard`, qui appartient à
   `planning`. Sur une instance sans planning, elle mène à un 404. Elle doit viser la **première
   entrée de navigation disponible** pour l'utilisateur — la navigation étant déjà construite à
   partir des manifestes actifs croisés aux permissions, l'information est disponible sur place.
2. **La garde `/no-access`** (ligne 47) ne se déclenche que si `churchRoles.length === 0`. Un
   Comptable sur une instance sans comptabilité conserve son rôle : il n'est pas redirigé. La
   condition devient « aucune entrée de navigation disponible » — c'est exactement le critère
   d'acceptation de la spec, et cela réutilise le parcours existant sans écran ni message dédié.

## Décisions & alternatives écartées

- **Choix : le proxy est le point de contrôle unique.** — *Pourquoi* : c'est le seul endroit qui
  s'exécute **avant** toute notion d'identité. Il ferme d'un seul geste le contournement Super
  Admin (une dizaine de sites : `src/lib/auth.ts:276,295,346,385,420,593,615`,
  `src/modules/agenda/auth.ts:28,51`, `src/modules/integration/auth.ts:35`), les replis sur
  l'appartenance (`isCaptureTeamMember`, `isIntegrationMember`), le cas des modules sans
  permission (`integration`, `storage`), et les liens publics par jeton. **Aucune de ces gardes
  n'est modifiée** — c'est le principal bénéfice : la surface de régression est nulle côté
  autorisation.
- **Écarté : passer le drapeau dans les gardes** (`requireChurchPermission` & co.) — *Raison* :
  il faudrait le propager dans une dizaine de gardes, et cela ne couvrirait ni les pages, ni les
  routes publiques par jeton, ni les modules sans permission. Coût supérieur, couverture
  inférieure.
- **Écarté : dériver le module depuis le nom du segment d'URL** — *Raison* : mesuré, seuls 8 des
  33 segments d'API portent le nom d'un module ; `planning` en possède 12 sous d'autres noms
  (`events`, `absences`, `requests`, `announcements`, `welcome-duty`, `planning`) et `/api/admin`
  est réparti entre trois propriétaires. Une convention de nommage couvrirait moins d'un quart
  des routes et imposerait un renommage massif hors périmètre.
- **Choix : élargir `config.matcher` à toute l'application.** — *Pourquoi* : sans cela, `/audio`,
  `/agenda`, `/accounting`, `/rooms`, `/jobs`, `/media`, `/integration`, `/ecouter`, `/rejoindre`
  ne traversent pas le proxy et resteraient joignables. C'est **la seule modification sensible aux
  performances** du lot. Mitigation : la résolution est une comparaison de chaînes en mémoire sur
  une table figée au chargement du process — aucune E/S, aucun accès base. Le matcher exclut
  explicitement `_next/static`, `_next/image`, `favicon.ico` et les fichiers à extension.
- **Choix : le proxy importe `src/lib/module-routes.ts`, jamais `src/lib/registry.ts`.** —
  *Pourquoi* : `registry.ts` importe les **index** de modules, qui tirent Prisma, NextAuth et S3.
  C'est précisément le couplage qu'ADR-0011 a démonté en extrayant les manifestes. Le proxy ne
  doit dépendre que des manifestes. Une règle `dependency-cruiser` (`proxy-only-module-routes`)
  interdira à `src/proxy.ts` d'importer `^src/(lib/registry|modules)`.
- **Choix : la liste blanche des routes publiques est dérivée de `routes.public`.** —
  *Pourquoi* : elle est aujourd'hui codée en dur dans le proxy et personne ne pense à la mettre à
  jour depuis le module. La déplacer dans le manifeste rend la question « cette adresse est-elle
  ouverte sans session ? » locale au module qui la porte, et la met sous le contrôle du même test
  d'exhaustivité.
- **Choix : réécriture interne vers `/module-absent` pour les pages.** — *Pourquoi* : `notFound()`
  produit un vrai statut 404 **et** l'habillage de l'application, sans changer l'URL affichée. Une
  réponse 404 fabriquée directement dans le proxy donnerait le bon statut mais une page nue.
  *À valider à l'implémentation* : si la réécriture ne produit pas le statut 404 attendu, replier
  sur une réponse 404 construite dans le proxy — le statut prime sur l'habillage.
- **Choix : `boot()` échoue sur un nom de module inconnu.** — *Pourquoi* : aujourd'hui
  `ENABLED_MODULES=audeo,core` désactive silencieusement l'audio. C'est le même défaut de fond
  que celui que cette feature corrige — un réglage qui ne fait pas ce qu'il annonce. Non demandé
  par la spec, ajouté ici : deux lignes, et signalé comme tel.
- **Choix : le diagnostic se limite à une ligne de journal au démarrage** (question ouverte 1 de
  la spec). — *Pourquoi* : un point de diagnostic exposé serait une nouvelle surface à protéger,
  pour un besoin d'exploitant qui a déjà accès aux journaux. *Écarté* : enrichir `/api/health` de
  la liste des modules actifs — révèle la configuration de l'instance à tout compte authentifié,
  sans bénéfice pour l'exploitant.
- **Choix : la documentation d'exploitation entre dans le périmètre** (question ouverte 2). —
  *Pourquoi* : la spec identifie l'absence de documentation comme une **cause** de l'inefficacité
  passée inaperçue. Corriger le mécanisme sans le documenter reproduit le défaut. À couvrir :
  `.env.example`, `docs/production.md`, `docs/architecture.md`, `docs/dev-onboarding.md`.
- **ADR-0012 à écrire** : « Le manifeste déclare la surface HTTP du module ; le proxy l'applique ».
  Critère de `docs/adr/README.md` rempli — la décision reste vraie si cette feature était
  réécrite, elle touche les 11 modules, et elle installe une obligation durable (tout nouveau
  `route.ts` doit être revendiqué). Elle référence et prolonge ADR-0011.

## Risques & points d'attention

- **Le matcher élargi devient un point de passage obligé de toute requête.** Une erreur dans la
  résolution de préfixe ne dégrade pas un module : elle rend l'instance inutilisable. Le test de
  résolution doit être exhaustif avant tout autre travail.
- **La table de routes se désynchronise silencieusement du code** au premier `route.ts` ajouté
  sans déclaration. C'est le risque principal, et c'est exactement ce que le test d'exhaustivité
  existe pour couvrir — il est **livrable avant** le reste, sur la base des routes actuelles.
- **`/admin` mêle trois propriétaires.** La résolution au préfixe le plus long le gère, mais toute
  nouvelle sous-section d'admin appartenant à un module devra être déclarée. Le test d'exhaustivité
  le rappellera.
- **Le Super Admin perd l'accès à des données présentes en base.** Acté par la spec ; la voie de
  retour est de réactiver le module et de redémarrer. À écrire noir sur blanc dans
  `docs/production.md` — c'est le point le plus susceptible de surprendre en exploitation.
- **Le journal d'audit d'un module désactivé** reste consultable via `/admin/audit-logs` (module
  `core`), et peut mentionner des actions de modules absents. Non traité : les entrées sont des
  données du noyau, les masquer relèverait de la purge (hors périmètre). À vérifier qu'aucun écran
  d'audit n'importe un libellé depuis un module.
- **`storage` ne déclare aucune route** mais `media` et `audio` en dépendent. La validation de
  dépendances existante suffit : désactiver `storage` en gardant `media` fait échouer le démarrage.
- **Régression sur les liens de partage existants** : sur l'instance de production, aucun module
  n'est désactivé (`ENABLED_MODULES` absent), donc le comportement est strictement inchangé. Le
  risque réel porte sur le passage par le proxy élargi, pas sur le filtre lui-même.
- **Le pastoral** (`/pastoral`, profils pastoraux) est rattaché à `agenda` dans la table
  ci-dessus. À confirmer à l'implémentation : `pastoralChurchIds` est lu par le layout du noyau,
  et `/admin/pastoral-profiles` est gardé par `church:manage` (permission `core`). Si le lien est
  plus fort que prévu, `/pastoral` bascule au noyau.

## Stratégie de tests

Tout en Vitest, aucun test manuel requis.

| Cible | Contenu |
|---|---|
| `src/core/__tests__/module-routes.test.ts` | Résolution : préfixe le plus long (`/api/admin/media` → `media` et non `core`), chemin exact vs préfixe, chemin orphelin → `orphan`, insensibilité à la barre finale et à la chaîne de requête. |
| `src/lib/__tests__/routes-exhaustivite.test.ts` | **Le test-clé.** Parcourt le système de fichiers (`src/app/**/route.ts`, `src/app/**/page.tsx`), convertit chaque fichier en chemin d'URL (segments dynamiques, groupes de routes `(auth)` neutralisés) et vérifie que **chacun** est revendiqué par exactement un module ou par le noyau. Symétrique : aucun préfixe déclaré ne pointe dans le vide. Même motif que `PERMISSION_OWNER` dans `src/modules/__tests__/manifests.test.ts`. |
| `src/core/__tests__/boot.test.ts` | Démarrage sans liste → 11 modules ; liste sans `core` → throw nommant la règle ; module inconnu → throw nommant le nom ; dépendance manquante → throw nommant la dépendance ; `core` seul → succès. |
| `src/__tests__/proxy.test.ts` (existant, étendu) | Module désactivé : page → réécriture, API → 404, route publique par jeton → 404 **sans** consulter le jeton. Module actif : comportement actuel préservé (les cas existants ne bougent pas). Routes du noyau toujours servies, quelle que soit la liste. Le matcher élargi ne capture pas `_next/static`. |
| `src/lib/__tests__/registry-subscriptions.test.ts` | `planning:event:cancelled` supprime les présences **même sans le module discipleship** ; `planning:request:status_changed` ne crée **pas** de `MediaProject` sans le module media, et en crée un avec. |
| `src/app/api/cron/__tests__/` | Sans `integration` ni `jobs` : la route répond 200 et n'appelle aucun de leurs services ; avec, le comportement actuel est préservé. |
| `src/app/(auth)/__tests__/` (existant) | Utilisateur dont les rôles ne portent que sur des modules désactivés → redirection `/no-access` ; atterrissage sur la première entrée de navigation disponible et non `/dashboard` en dur. |

Ordre d'exécution recommandé : le test d'exhaustivité **d'abord**, sur les routes actuelles, avant
d'écrire la moindre ligne du proxy. Il transforme la table de déclaration en objet vérifié plutôt
qu'en promesse.

## Après le plan

Étape suivante : **`/tasks`**. Le découpage attendu suit l'ordre des trois mouvements
(déclarer → fermer → conditionner), avec ADR-0012 et la documentation d'exploitation dans le même
lot.
