# Plan technique — Export Excel des demandes d'intégration

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-08-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : la nouvelle route importe `requireIntegrationExportAccess` et
      `buildIntegrationExportRows` depuis **`@/modules/integration`** (l'index), jamais un
      chemin interne. Aucune nouvelle dépendance inter-modules.
- [x] **Sécurité** : la route est protégée par `requireIntegrationExportAccess(churchId)` ;
      le `churchId` est **réimposé dans la clause Prisma** (`where: { churchId }`), le
      navigateur ne pouvant donc pas exfiltrer une autre église ; le périmètre berger est
      **revérifié serveur** et non déduit du corps de la requête.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) : `requireIntegrationAccess`
      l'utilise déjà (import dynamique), la nouvelle garde s'appuie dessus. Aucun recours à
      `hasPermission` (déprécié).
- [x] **Validation Zod** : le corps du POST (`churchId`, `requestIds[]`) est validé par un
      schéma Zod avant tout accès BDD.
- [x] **Migration Prisma** : **aucune**. Voir décision **D4** — `AuditLog.action` est déjà
      une colonne `String` en base ; seul le type TypeScript s'élargit.
- [x] **Enums** depuis `@/generated/prisma/client` : la feature ne manipule aucun enum
      Prisma en valeur — elle projette les codes reçus (`ageRange`, `churchStatus`,
      `status`) vers des libellés français via des tables de correspondance.
- [x] **UI** : `Button` de `src/components/ui/` réutilisé. Aucun composant UI générique créé.

## Approche générale

L'ossature est **déjà écrite trois fois** dans le projet (exports absences, discipolat,
comptes rendus). On ne réinvente rien : on suit le patron de `POST /api/absences/export`,
qui est aussi le plus proche fonctionnellement.

Le fil directeur en quatre points :

1. **Le client envoie les identifiants qu'il affiche**, pas ses filtres. C'est ce qui rend
   le critère central de la spec (« le fichier contient exactement ce qui est à l'écran »)
   vrai **par construction** plutôt que par une réimplémentation serveur du filtrage, qui
   pourrait diverger (cf. **D1**).
2. **Le serveur ne fait jamais confiance à cette liste** : il la recoupe avec l'église
   courante, le périmètre de l'appelant et l'exclusion des archivées. Tout identifiant qui
   ne survit pas au recoupement est silencieusement absent du fichier.
3. **La projection en lignes est une fonction pure**, isolée dans le module et testable
   sans HTTP — c'est là que vivent les 18 colonnes, les libellés français, les `Oui/Non` et
   la règle « étape non atteinte → cellule vide ».
4. **La neutralisation anti-formule devient un helper partagé** au lieu d'une quatrième
   copie (cf. **D2**) — c'est une mesure de sécurité, elle ne doit pas exister en quatre
   exemplaires susceptibles de diverger.

## Modèle de données

**[Aucun changement]** — aucune migration Prisma.

La feature lit `FamilyIntegrationRequest` (et sa relation `assignedBerger`), toutes deux
existantes. L'écriture du journal utilise `AuditLog`, dont la colonne `action` est **déjà
un `String`** :

```prisma
model AuditLog {
  action     String   // CREATE, UPDATE, DELETE  ← commentaire à étendre : + EXPORT
  entityType String
  entityId   String
  details    Json?
  // …
}
```

Écrire `"EXPORT"` n'exige donc **aucune migration** : c'est le type TypeScript de
`logAudit`, plus restrictif que la base, qu'il faut élargir (**D4**).

## API

| Endpoint | Méthode | Permission | Entrée (Zod) | Sortie |
|---|---|---|---|---|
| `/api/integration/requests/export` | **POST** | `requireIntegrationExportAccess(churchId)` — équipe Intégration / Admin / Secrétaire / Super Admin ; **refus explicite du périmètre restreint** | `{ churchId: string, requestIds: string[] (1..2000) }` | Flux `.xlsx` + `Content-Disposition: attachment` |

Pourquoi **POST** et non GET : le corps transporte une liste d'identifiants qui peut être
longue (au-delà de ce qu'une query string encaisse confortablement), et l'action est
journalisée — le patron des trois exports existants est identique.

Réponse en cas de refus : `requireIntegrationExportAccess` lève `FORBIDDEN`, qu'
`errorResponse` traduit déjà en **403** (comportement vérifié par le test d'export des
absences). Corps invalide → **400** via `ZodError`, également géré par `errorResponse`.

## Services / logique métier

### `src/modules/integration/auth.ts` — garde d'export

```
requireIntegrationExportAccess(churchId)
  → réutilise requireIntegrationAccess(churchId)
  → si scope.scoped === true  →  throw ApiError(403, …)   // berger / co-berger
  → sinon retourne { session }
```

Une garde **dédiée** plutôt qu'un test `scope.scoped` recopié dans la route : la règle
« extraire est plus strict que consulter » est une décision métier, elle appartient au
module, et elle est ainsi testable et réutilisable si un second export du module arrive.
Exportée via `src/modules/integration/index.ts`.

### `src/modules/integration/services/export-service.ts` — projection en lignes (nouveau)

```
buildIntegrationExportRows(requests) → Record<string, string>[]
EXPORT_COLUMNS : les 18 en-têtes, dans l'ordre de la spec
```

Fonction **pure**, sans Prisma ni I/O. Elle porte :

- les tables de correspondance vers les **libellés affichés à l'écran** — statuts
  (`SUBMITTED` → « En attente »…), tranches d'âge (`ADULT` → « Adulte (30–60 ans) »…),
  statut d'église (`VISITOR` → « Visiteur »…). Ces tables existent aujourd'hui **en double**
  dans `IntegrationDashboard.tsx` et `RequestDetail.tsx` ; le service devient la source
  côté serveur, sans toucher aux deux composants (cf. **risque n°4**) ;
- les booléens `salvationCall` / `pastoralCareRequested` → **`Oui` / `Non`** ;
- les dates au format français, **chaîne vide** pour une étape non atteinte ;
- les champs optionnels `null` → **chaîne vide**, jamais `"null"`.

Placement conforme à la constitution §I (« la logique métier vit dans
`src/modules/X/services/`, pas dans les route handlers ») et surtout : **18 colonnes avec
des règles de projection, c'est exactement ce qu'un test unitaire doit verrouiller**.

### `src/lib/excel.ts` — neutralisation anti-formule (nouveau, partagé)

```
sanitizeExcelValue(value)  // préfixe d'une apostrophe toute chaîne commençant par = + - @ \t \r
sanitizeRow(row)
```

Extraction des **trois copies identiques** aujourd'hui présentes dans
`api/absences/export/route.ts`, `api/discipleships/export/route.ts` et
`api/events/reports/export/route.ts` — les trois routes s'y raccordent. Justification en
**D2**.

## UI / composants

| Fichier | Nature |
|---|---|
| `src/app/(auth)/integration/requests/IntegrationDashboard.tsx` | **Modifié** — bouton d'export + téléchargement |
| `src/app/(auth)/integration/requests/page.tsx` | **Modifié** — passe `churchId` et le droit d'export en props |
| `src/app/api/integration/requests/export/route.ts` | **Nouveau** — route handler |
| `src/modules/integration/auth.ts` · `index.ts` | **Modifiés** — garde d'export |
| `src/modules/integration/services/export-service.ts` | **Nouveau** — projection pure |
| `src/lib/excel.ts` | **Nouveau** — helper partagé |
| `src/lib/audit.ts` | **Modifié** — `action` accepte `"EXPORT"` |
| `src/app/(auth)/admin/audit-logs/AuditLogsClient.tsx` | **Modifié** — libellé « Export » |
| `api/absences/export`, `api/discipleships/export`, `api/events/reports/export` | **Modifiés** — consomment `@/lib/excel` |

### Côté page (Server Component)

`page.tsx` dispose déjà de `churchId` et du `scope` rendu par `requireIntegrationAccess`.
Il transmet `churchId` et `canExport={!scope.scoped}` au tableau de bord. **Aucune requête
supplémentaire** : le droit d'export est exactement la négation du périmètre restreint,
déjà calculé.

### Côté tableau de bord (Client Component)

- Bouton **« Exporter (N) »** — le compteur reprend `filtered.length`, ce qui rend visible
  avant le clic ce que le fichier contiendra. Rendu **seulement si `canExport`**, et
  **désactivé quand `filtered.length === 0`** (cas limite de la spec : on ne télécharge pas
  un fichier vide).
- Au clic : `POST` avec `filtered.map(r => r.id)` — c'est-à-dire **la liste déjà calculée
  pour l'affichage**, donc strictement la même. Puis téléchargement par `Blob` +
  `URL.createObjectURL` + `link.download`, nom `demandes-integration-AAAA-MM-JJ.xlsx`,
  identique au patron des absences.
- État `exporting` pour désactiver le bouton pendant la génération, message d'erreur
  discret en cas d'échec. Le composant `Button` gère `disabled` (rappel : il **n'a pas** de
  prop `loading`).

## Décisions & alternatives écartées

- **D1 — Le client envoie les IDs affichés, pas ses filtres.**
  *Pourquoi* : le critère d'acceptation central est « le fichier = ce qui est à l'écran ».
  En envoyant `filtered.map(r => r.id)`, c'est-à-dire le tableau **déjà utilisé pour le
  rendu**, l'égalité est structurelle, pas maintenue à la main. Effet de bord précieux :
  tout filtre ajouté plus tard au tableau de bord (issue séparée) sera **automatiquement**
  respecté par l'export, sans une ligne de code côté serveur.
  *Écarté* : `GET /export?status=&search=` avec refiltrage serveur. *Raison* : il faudrait
  réimplémenter la recherche texte (concaténation nom + prénom + téléphone + email +
  famille, insensible à la casse) à l'identique du client. Deux implémentations d'une même
  règle divergent tôt ou tard — et la divergence casserait précisément le critère central,
  silencieusement.

- **D2 — Extraire `sanitizeExcelValue` dans `src/lib/excel.ts` plutôt qu'en écrire une
  quatrième copie.**
  *Pourquoi* : la fonction est **déjà dupliquée à l'identique dans trois routes**. En
  ajouter une quatrième, c'est quadrupler la surface d'une mesure de **sécurité** — le jour
  où l'on découvre un caractère d'amorce oublié, il faut le corriger en quatre endroits, et
  l'oubli est silencieux (aucun test ne casse). Le diff total est *négatif* : trois blocs de
  ~12 lignes supprimés contre un fichier de ~12 lignes créé.
  *Écarté* : dupliquer une quatrième fois, par prudence de périmètre. *Raison* : c'est le
  cas d'école où le raccourci coûte plus cher qu'il ne rapporte, et la feature est le bon
  moment pour solder la dette puisqu'on ajoute justement le quatrième appelant.

- **D3 — Une garde dédiée `requireIntegrationExportAccess` dans le module.**
  *Pourquoi* : « exporter est plus strict que consulter » est une règle métier, pas un
  détail de route. Dans le module, elle est testable isolément et s'applique
  identiquement à un futur second export.
  *Écarté* : tester `scope.scoped` directement dans la route. *Raison* : la règle
  s'évaporerait dans un handler et serait recopiée au prochain export.

- **D4 — Journaliser avec `action: "EXPORT"`, en élargissant le type TypeScript.**
  *Pourquoi* : `AuditLog.action` est une colonne **`String`** — la base accepte déjà la
  valeur, **aucune migration n'est nécessaire**. Le type de `logAudit` (`"CREATE" |
  "UPDATE" | "DELETE"`) est plus restrictif que la réalité ; on l'élargit d'une valeur.
  Un export **n'est ni une création, ni une modification, ni une suppression** : le
  déguiser en `CREATE` rendrait le journal trompeur, exactement là où il doit être fiable.
  *Conséquence à traiter* : `AuditLogsClient` a une table `ACTION_LABELS` avec repli — le
  journal n'explose pas, mais afficherait un libellé brut. On ajoute donc l'entrée
  « Export ».
  *Écarté* : un modèle de journal dédié aux exports. *Raison* : sur-ingénierie, `AuditLog`
  couvre le besoin (auteur, église, date, `details` libre pour le nombre de lignes).

- **D5 — Ne pas journaliser rétroactivement les trois exports existants.**
  *Pourquoi* : **aucun des trois exports actuels ne journalise**. Cette feature introduit la
  pratique, mais l'étendre aux trois autres est un changement de comportement sur des
  fonctionnalités que la spec 033 ne couvre pas. À proposer comme issue de suivi.

- **D6 — Bouton libellé avec le nombre de lignes (« Exporter (12) »).**
  *Pourquoi* : rend le contrat de la feature visible **avant** le clic et supprime la
  mauvaise surprise du fichier qui ne contient pas ce qu'on croyait. Coût nul, `filtered`
  est déjà calculé.

## Risques & points d'attention

1. **Plafond du nombre d'identifiants.** Le schéma Zod borne la liste (le précédent absences
   plafonne à 1000). La spec exige qu'« un export de plusieurs centaines de lignes
   aboutisse ». On retient **2000**, mais au-delà Zod rejette avec un **400 peu parlant**
   pour l'utilisateur. À traiter côté client par un message explicite plutôt qu'un « Erreur
   lors de l'export » générique — sinon le jour où l'église dépassera le seuil, le symptôme
   sera incompréhensible.

2. **L'UI masque, le serveur refuse — les deux sont nécessaires.** Cacher le bouton pour un
   berger est du confort, pas une sécurité : la garde serveur est ce qui compte, et elle
   doit être testée pour elle-même (test dédié « un berger scopé reçoit 403 »).

3. **Fenêtre entre l'affichage et l'export.** Les identifiants envoyés peuvent référencer
   des demandes entre-temps modifiées, archivées ou supprimées. Le comportement retenu
   (spec) est l'exclusion silencieuse — c'est le comportement naturel d'un
   `where: { id: { in: [...] } }`, aucun code spécifique. Conséquence assumée : le fichier
   peut contenir **moins** de lignes que le compteur affiché. Acceptable, et préférable à un
   échec bloquant.

4. **Tables de libellés en triple.** `STATUS_LABELS` existe dans `IntegrationDashboard.tsx`,
   `AGE_LABELS` / `CHURCH_STATUS_LABELS` dans `RequestDetail.tsx`, et le service d'export en
   introduit une copie serveur. Les factoriser supposerait de partager des constantes entre
   composants client et module serveur — hors périmètre ici, et sans risque de sécurité
   (une divergence produirait un libellé incohérent, pas une fuite). **Noté comme dette**,
   pas traité : la corriger proprement mérite sa propre passe.

5. **Refactor des trois routes existantes.** Les brancher sur `@/lib/excel` les modifie sans
   changer leur comportement. Seul l'export des absences dispose d'un test ; les deux autres
   n'en ont pas. Le typecheck et le test des absences couvrent le risque, mais la
   modification doit rester **strictement mécanique** (supprimer la copie locale, importer)
   — aucune autre retouche dans ces fichiers.

6. **Données personnelles.** Le fichier concentre nom, téléphone, email, ville et marqueurs
   pastoraux de personnes souvent extérieures à l'église. Les exclusions décidées (notes
   internes, motif d'abandon, adresse précise) sont des **critères d'acceptation**, pas des
   préférences : elles doivent être testées, sinon elles régresseront à la première
   évolution du service.

## Stratégie de tests

### `src/lib/__tests__/excel.test.ts` (nouveau)

Le cœur sécurité de la feature, aujourd'hui **testé nulle part** malgré ses trois copies.

- une chaîne commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est
  préfixée d'une apostrophe ;
- une chaîne ordinaire est renvoyée **inchangée** (pas de faux positif) ;
- les valeurs non-chaînes (nombre, booléen, `null`, `Date`) traversent sans altération ;
- `sanitizeRow` traite **toutes** les valeurs d'un objet et préserve ses clés.

### `src/modules/integration/__tests__/export-service.test.ts` (nouveau)

- les **18 colonnes** sont produites, **dans l'ordre** de la spec ;
- les codes sont projetés vers les **libellés français** (`SUBMITTED` → « En attente »,
  `ADULT` → « Adulte (30–60 ans) », `VISITOR` → « Visiteur ») ;
- `salvationCall` / `pastoralCareRequested` deviennent **`Oui` / `Non`** ;
- une **étape non atteinte** produit une cellule **vide**, jamais une date de repli ;
- les champs `null` (téléphone, email, ville, famille, berger) produisent une **chaîne
  vide**, jamais `"null"` ;
- **aucune** des clés produites ne correspond aux notes internes, au motif d'abandon ou à
  l'adresse postale — le test qui verrouille l'exclusion décidée (risque n°6).

### `src/app/api/integration/requests/export/__tests__/route.test.ts` (nouveau)

Sur le patron du test d'export des absences (`prismaMock`, `createAdminSession`, mock de
`@/lib/auth`) :

- **403** si l'accès à l'intégration est refusé ;
- **403** pour un **berger au périmètre restreint** (`scope.scoped === true`) — la garde
  métier, testée pour elle-même ;
- **400** sur un corps invalide (`churchId` manquant, `requestIds` vide ou hors plafond) ;
- la requête Prisma filtre bien sur **`churchId`** et **`archivedAt: null`** — les deux
  critères d'isolation de la spec ;
- un identifiant **hors périmètre** ne se retrouve pas dans le fichier ;
- l'**en-tête de réponse** porte le type MIME xlsx et un `Content-Disposition` avec la date
  du jour ;
- `logAudit` est appelé **une fois**, avec `action: "EXPORT"` et le **nombre de lignes**
  réellement écrites (pas le nombre d'identifiants reçus).

### Non couvert automatiquement

Le rendu React (présence/absence du bouton selon `canExport`, état désactivé à zéro ligne)
n'est pas testable : `vitest` tourne en `environment: "node"` et n'inclut que `*.test.ts`.
Recette manuelle : compte équipe Intégration (bouton présent, compteur juste, fichier
conforme), compte berger (bouton absent), filtre ne renvoyant rien (bouton désactivé).

### Portes de qualité

`npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.
`lint:boundaries` doit rester vert **sans modifier `.dependency-cruiser.cjs`** : la route
n'importe le module que par son index.

---

*Aucune question ouverte. Étape suivante : `/tasks`.*
