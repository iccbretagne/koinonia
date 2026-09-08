# ADR-0012 — Le manifeste déclare la surface HTTP du module ; le proxy l'applique

- **Statut** : Accepté
- **Date** : 2026-09-09

## Contexte

`ENABLED_MODULES` existait déjà comme variable d'environnement, mais ne produisait aucun effet
observable : elle filtrait le contenu du registry (permissions, navigation), sans jamais toucher
au routage HTTP. Une page ou une route API d'un module « désactivé » restait pleinement joignable
— seul le lien de navigation disparaissait. Le contrôle d'accès applicatif (permissions par rôle)
s'exécutait toujours, et le protégeait donc contre un utilisateur sans droit, mais pas contre
l'existence même de la fonctionnalité sur l'instance.

Cette lacune touchait aussi le Super Admin : ses gardes contournent la plupart des vérifications
de permission par construction (`isSuperAdmin` court-circuite `requireChurchPermission` dans une
dizaine d'endroits), donc même une hypothétique vérification de module au niveau des handlers
n'aurait pas fermé son accès à un module désactivé. Le proxy, qui s'exécute avant toute résolution
de session ou d'identité, était le seul point capable d'appliquer la règle uniformément.

Le champ `routes` de `ModuleManifest` existait dans le type depuis l'introduction du registry,
mais n'était rempli par aucun des 11 modules — chaque manifeste ne déclarait que dépendances et
permissions. Sans cette déclaration, le proxy n'a aucun moyen de savoir quelles routes appartiennent à quel module.

## Décision

Chaque manifeste déclare explicitement sa surface HTTP dans `routes` : préfixes de pages
authentifiées (`authenticated`), préfixes d'API authentifiées (`api`), et routes publiques
(`public`, avec restriction optionnelle de méthode HTTP — `{ path, method }` — pour les routes
publiques en écriture seulement, comme `/api/integration/requests` qui n'est ouverte qu'en POST).

`src/core/module-routes.ts` (pur, sans dépendance framework) construit une table de préfixes à
partir des manifestes actifs et d'une liste noyau explicite (`src/lib/module-routes.ts`,
`NOYAU_ROUTES` — les routes qui ne relèvent d'aucun module : `/`, `/api/auth`, `/api/health`,
`/admin` lui-même, etc.), et résout toute URL par préfixe le plus long. `src/proxy.ts` consulte
cette table avant toute lecture de cookie de session : une route dont le préfixe n'appartient à
aucun module actif répond 404 (JSON pour `/api/*`, page `/module-absent` sinon) — y compris pour
le Super Admin, puisque le contrôle précède toute notion d'identité.

Un test d'exhaustivité (`route-exhaustiveness.test.ts`) parcourt l'arborescence réelle de
`src/app/` et vérifie que chaque `route.ts`/`page.tsx` est couvert par exactement un préfixe —
module ou noyau — jamais zéro, jamais plusieurs. Ce test, pas la relecture manuelle, est ce qui a
révélé les deux trous du manifeste `media` (`/admin/media` déclaré mais inexistant) et du noyau
(`/admin` lui-même, une page réelle non couverte).

Exception nommée et volontaire : les abonnements de nettoyage référentiel du bus d'événements
(`planningBus.on("planning:event:cancelled", …)` supprimant les données liées d'un module
désactivé) ne sont **jamais** conditionnés par `registry.has(...)` — seules les créations de
données le sont. Désactiver un module ne doit jamais faire échouer une suppression sur une
contrainte de clé étrangère orpheline.

## Alternatives considérées

- **Vérifier le module actif dans chaque route handler** (`requireModuleEnabled("audio")` en tête
  de chaque `route.ts`) — répartit le contrôle sur ~150 fichiers, chacun pouvant l'oublier ; ne
  fournit aucune garantie d'exhaustivité automatisée ; et n'aurait pas fermé l'accès Super Admin de
  façon uniforme sans une discipline manuelle équivalente à ce que le proxy centralise gratuitement.

- **Liste blanche de préfixes codée en dur dans `proxy.ts`**, plutôt que portée par chaque
  manifeste — aurait dupliqué une information que le manifeste porte déjà (dépendances,
  permissions) sans lien structurel avec elle : ajouter une route à un module n'aurait pas obligé
  à toucher son manifeste, seulement une liste distante et non testée pour l'exhaustivité.

- **403 plutôt que 404** pour un module désactivé — retenu comme rejeté dès la spec (038) : 403
  confirme l'existence de la ressource, ce que l'objectif (« absent de l'instance ») exclut
  explicitement.
