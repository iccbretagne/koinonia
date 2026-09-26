# ADR-0017 — Une permission n'approxime jamais un rôle administratif

- **Statut** : Accepté
- **Date** : 2026-09-26

## Contexte

L'issue #583 a révélé un anti-motif récurrent dans le code : une garde qui veut dire « Admin ou
Secrétaire » l'exprime en testant une permission large détenue par ces rôles pour une autre
raison — le plus souvent `members:manage` ou `events:manage` — plutôt qu'une permission qui nomme
l'action elle-même.

`members:manage` existe pour que le Ministre et le Responsable de département gèrent les fiches
STAR de leur périmètre. `events:manage` existe pour la gestion des événements d'église. Une garde
qui les réutilise comme raccourci pour « administration de l'église » fonctionne tant que ces
permissions ne sont détenues que par les rôles voulus — et sur-octroie silencieusement l'accès dès
qu'un autre rôle les obtient pour sa propre raison légitime. C'est exactement ce qui s'est produit :
`requireIntegrationAccess()` (dossiers d'accueil, coordonnées personnelles et export) et les routes
`/api/integration/parcours*` testaient `members:manage || events:manage`, ce qui donnait accès à
**tout Ministre et tout Responsable de département**, quel que soit son département — alors que la
documentation de l'application a toujours réservé cet accès à l'administration de l'église et à
l'équipe dédiée. `/api/users` (liste des comptes) et `DELETE /api/users/[userId]` avaient le même
défaut : l'API n'était pas plus stricte que l'écran qui l'appelle.

Un audit du RBAC mené avec la spec 054 a montré que ce n'était pas un cas isolé : plusieurs gestes
sur les membres (repérage et fusion de doublons, liaison de comptes, attribution en masse du rôle
STAR, validation des demandes d'accès) ignoraient de la même façon le périmètre de responsabilité
de l'appelant, alors que la consultation et la modification des fiches le respectent.

## Décision

1. **Une garde vérifie la permission qui nomme l'action qu'elle protège**, jamais une permission
   détenue par les bons rôles pour une autre raison. Quand aucune permission existante ne nomme
   l'action, le module concerné en déclare une dans son manifeste plutôt que d'emprunter celle
   d'un autre module (`integration:manage`, `users:manage` élargi à l'Admin — spec 054).
2. **Un module aux règles d'accès propres déclare ses permissions.** Un manifeste sans permission
   (`permissions: {}`) n'est acceptable que si le module n'a réellement aucune restriction propre
   à exprimer — pas comme économie sur une permission à créer.
3. **Un test-gardien** (`src/lib/__tests__/rbac-no-role-proxy.test.ts`) échoue si `members:manage`
   ou `events:manage` apparaît dans un fichier hors d'une liste blanche commentée, où chaque
   entrée justifie l'usage. Un raccourci `events:manage` qui n'entraîne aucun sur-octroi
   aujourd'hui (parce que la permission n'est détenue que par les rôles voulus) est toléré mais
   marqué comme fragile — il cassera silencieusement le jour où un autre rôle l'obtiendra.
4. **Les accès qui ne passent par aucune permission** (appartenance à un département spécialisé,
   affectation nominative à un dossier) restent un mécanisme à part, mais sont décrits dans une
   table dédiée qui alimente la fiche d'une personne dans la gestion des accès (spec 054, lot 1) —
   ils ne doivent plus jamais être invisibles sur le seul écran qui devrait dire qui a accès à quoi.

## Alternatives considérées

- **Corriger seulement le cas confirmé par l'issue #583** (dossiers d'accueil) sans généraliser —
  *Écarté* : l'audit a immédiatement trouvé deux autres instances du même défaut
  (`/api/integration/parcours*`, `/api/users`), et le mécanisme qui les a produites reste en place
  si on ne le nomme pas. Corriger l'exemple sans corriger la règle laisse la porte ouverte à la
  prochaine occurrence.
- **Un helper générique qui résout « est administrateur » une fois pour toutes** (ex.
  `isChurchAdmin(session, churchId)`) — *Écarté* : masquerait le problème de fond derrière un nom
  différent — la vraie question n'est jamais « qui administre ? » mais « qui a le droit de faire
  précisément ce geste ? ». Une permission nommée par action force à se poser cette question à
  chaque nouvelle garde.
- **Un test qui interdirait toute réutilisation de `members:manage`/`events:manage` sans
  exception** — *Écarté* : `events:manage` reste, aujourd'hui, un raccourci sûr à une quinzaine
  d'endroits parce qu'il n'est détenu que par les rôles voulus ; l'interdire sans exception aurait
  forcé une refonte hors du périmètre de la spec 054 pour un risque qui n'est pas encore réalisé.
  La liste blanche commentée retient la trace du risque sans l'imposer tout de suite.

## Conséquences

- Toute nouvelle garde qui approxime un rôle par une permission voisine doit désormais soit
  utiliser une permission qui nomme l'action, soit être ajoutée à la liste blanche du
  test-gardien avec une justification écrite — ce qui rend le choix visible en revue de code.
- Un module qui a ses propres règles d'accès ne peut plus se dispenser de déclarer une permission
  au motif que « ça marche déjà avec celle d'un autre module ».
- Les accès accordés hors permission (appartenance, affectation nominative) doivent être
  répertoriés dans une table exploitable par la gestion des accès, pas seulement documentés en
  prose dans `docs/auth.md`.

## Références

- Issue #583, spec `specs/054-refonte-gestion-acces/spec.md` et son annexe `audit-rbac.md`
- [ADR-0009](0009-garde-perimetre-explicite.md) — garde de périmètre explicite, principe voisin
  pour le périmètre de responsabilité
- [ADR-0014](0014-fonctions-departement-droits-ecriture.md) — les accès hors permission doivent
  être nommés et énumérés, même logique appliquée ici à la table des accès hérités
