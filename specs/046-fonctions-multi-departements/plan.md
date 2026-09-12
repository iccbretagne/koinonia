# Plan technique — Plusieurs départements pour une même fonction

- **Spec associée** : `./spec.md`
- **Statut** : Brouillon
- **Mis à jour le** : 2026-09-12

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'appelle audio/integration que via `@/modules/audio` et
      `@/modules/integration` ; le nouveau helper vit dans `src/lib/` (noyau, sans dépendance module)
- [x] **Sécurité** : aucune route ajoutée ; les gardes existantes (`requireChurchPermission`,
      `resolveChurchId`) sont conservées, seul le test d'appartenance change de forme
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — aucune matrice modifiée
- [x] **Validation** Zod : le `PATCH` département garde son schéma actuel
- [x] **Migration** Prisma : **aucune** (le schéma autorise déjà N départements par fonction)
- [x] **Enums** : `RequestType` importé depuis `@/generated/prisma/client`
- [x] **UI** : `CheckboxGroup` de `src/components/ui/` réutilisé pour la multi-sélection

## Approche générale

Le schéma n'a pas de contrainte d'unicité sur `Department.function` : le blocage est applicatif.
Deux fils :

1. **« L'équipe d'une fonction » = l'ensemble des départements qui la portent.** Chaque endroit
   qui fait `findFirst({ function })` passe par un helper unique qui renvoie **tous** les
   identifiants. Les contrôles d'appartenance déjà en `count`/`some` restent inchangés.
2. **Une demande est routée vers une fonction, pas vers un département.** La fonction destinataire
   se déduit du **type** de la demande, correspondance aujourd'hui déjà strictement fixe :

   | Type de demande | Fonction |
   |---|---|
   | `VISUEL` | `PRODUCTION_MEDIA` |
   | `RESEAUX_SOCIAUX` | `COMMUNICATION` |
   | `DIFFUSION_INTERNE`, `AJOUT_EVENEMENT`, `MODIFICATION_EVENEMENT`, `ANNULATION_EVENEMENT`, `MODIFICATION_PLANNING`, `DEMANDE_ACCES` | `SECRETARIAT` |

   Files de traitement et autorisations lisent cette correspondance au lieu de `assignedDeptId`.
   Une demande « suit la fonction » (spec) par construction : retirer un département de la
   fonction ne la fait ni disparaître ni changer de mains.

## Modèle de données

**Aucun changement de schéma.**

`Request.assignedDeptId` n'est plus ni lu ni écrit par le code (nouvelles demandes : `null`). La
colonne est **conservée** dans ce lot (voir Décisions) ; sa suppression fera l'objet d'un
`chore` ultérieur avec migration, une fois la bascule constatée en production.

## API

Aucun endpoint ajouté. Modifications de comportement :

| Endpoint | Méthode | Permission (inchangée) | Changement |
|---|---|---|---|
| `/api/departments/[departmentId]` | PATCH | `events:manage` (église résolue par `resolveChurchId`) | Ne désassigne plus les autres départements portant la même fonction. Schéma Zod `{ function: string \| null }` inchangé |
| `/api/requests` | POST | inchangée | Ne cherche plus de département destinataire ; `assignedDeptId` non renseigné |
| `/api/requests` | GET | inchangée | Le filtre `assignedDeptId` (inutilisé par le front, vérifié) est retiré ; `assignedDept` remplacé par `assignedDepts` + `assignedFunction` |
| `/api/requests/[id]` | GET | inchangée | Idem pour la demande et ses sous-demandes |
| `/api/requests/[id]` | GET / PATCH | `members:view` + (manager \| membre de la fonction \| auteur) | « membre du département assigné » devient « membre d'un département de la fonction du type » |
| `/api/announcements` | POST | inchangée | Vérifie qu'**au moins un** département porte Secrétariat/Communication (même message d'erreur) ; plus d'`assignedDeptId` |

## Services / logique métier

### Nouveau : `src/lib/function-departments.ts` (serveur)

- `getFunctionDepartmentIds(churchId, fn, db?)` → `string[]` — `findMany` des départements de
  l'église portant `fn`, trié par `id` (résultat déterministe).
- `isMemberOfFunction(userDeptIds, churchId, fn, db?)` → `boolean` — intersection non vide.
- `getFunctionDepartmentsMap(churchId, fns, db?)` → `Map<fn, { id, name }[]>` — une requête pour
  plusieurs fonctions, noms triés ; alimente l'affichage du destinataire.

### Complément : `src/lib/department-functions.ts` (constantes, importable client)

- `REQUEST_TYPE_FUNCTION: Record<RequestType, DeptFunction>` + `functionForRequestType(type)`.
- `DEPT_FN_LABEL` (Secrétariat, Communication, Production Média…) pour le cas « non configuré ».

### Consommateurs à migrer

| Fichier | Aujourd'hui | Après |
|---|---|---|
| `src/modules/audio/services/access.ts` | `getCaptureDepartmentId` (`findFirst`) | `getCaptureDepartmentIds` ; `isCaptureTeamMember`/`isCaptureTeamLead` testent l'intersection. Export de l'index renommé |
| `src/modules/integration/services/family-service.ts:221` | relance → membres d'**un** dept INTEGRATION | `userDepartment.findMany({ departmentId: { in } })`, dédoublonnage par `userId` |
| `src/modules/integration/services/msdp-service.ts:256` | idem MSDP | idem |
| `src/app/(auth)/secretariat/requests/page.tsx` | `findFirst` + `assignedDeptId` | ids de la fonction pour le garde ; file = types `SECRETARIAT`, `parentRequestId: null` |
| `src/app/(auth)/media/requests/page.tsx` | idem | file = `type: VISUEL` |
| `src/app/(auth)/communication/requests/page.tsx` | idem | file = `type: RESEAUX_SOCIAUX` |
| `src/app/(auth)/layout.tsx` (lien Intégration) | `findFirst` | corrigé par la PR #561 (`count` sur INTEGRATION/MSDP) — **prérequis** |

Déjà conformes, **inchangés** : `notifyDeptMembers` (filtre `some` + dédoublonnage),
`isIntegrationMember`/`isMsdpMember`/`isProductionMediaMember`/`isCommunicationMember`/Protocole
(`count`), conseillers MSDP (`some`), trame des annonces et ouverture/fermeture (`some`),
détection de l'équipe Secrétariat dans `src/lib/auth.ts` (spec 045, `some`), `serviceDepts` du layout.

## UI / composants

- **`/admin/departments/functions`** (`DeptFunctionsClient.tsx`) : le `<select>` mono-valeur de
  chaque carte devient une liste de cases (`CheckboxGroup`, groupée par ministère). Cocher →
  `PATCH { function: fn }` ; décocher → `PATCH { function: null }`. Un département qui porte déjà
  une **autre** fonction est affiché désactivé, suffixé du libellé de sa fonction (règle « au plus
  une fonction par département » de la spec, rendue visible au lieu du déplacement silencieux
  actuel). Résumé sous la carte : « ✓ Intégration Adultes, Intégration Jeunes » ou l'avertissement
  actuel si vide. Liste scrollable (`max-h` + `overflow-y-auto`) pour rester utilisable sur mobile.
- **Mes demandes** (`RequestsList.tsx` : ligne, sous-demandes, export) : « → {assignedDept.name} »
  devient « → {départements portant **actuellement** la fonction du type} », noms séparés par des
  virgules et triés — ex. « → Pôle administratif » (un seul département : **affichage identique à
  aujourd'hui**) ou « → Intégration Adultes, Intégration Jeunes ». Aucun département configuré :
  « → {libellé de la fonction} (non configuré) ». Calcul côté serveur (`requests/page.tsx`, `GET
  /api/requests`, `GET /api/requests/[id]`) : **une seule** requête par chargement récupère les
  départements des fonctions de l'église, puis on associe chaque demande à sa fonction via
  `functionForRequestType` — pas de requête par demande. Le champ exposé au client remplace
  `assignedDept` par `assignedDepts: { id, name }[]` plus `assignedFunction`.
- Pages de file : pas de changement visuel.

## Décisions & alternatives écartées

- **Choix** : fonction déduite du type de demande — *Pourquoi* : la correspondance est déjà fixe
  et exhaustive dans le code ; elle rend « la demande suit la fonction » vrai sans migration ni
  réaffectation lors d'un retrait.
- **Écarté** : colonne `assignedFunction` sur `Request` + backfill — *Raison* : duplique une
  information dérivable du type ; migration et risque de désynchronisation sans bénéfice.
- **Écarté** : `assignedDeptId` = « premier » département de la fonction — *Raison* : c'est
  précisément le choix arbitraire que la spec interdit ; et une demande resterait liée à un
  département retiré.
- **Écarté** : table de liaison N-N demande ↔ départements — *Raison* : sur-ingénierie pour une
  file partagée.
- **Choix** : afficher au demandeur les départements **actuels** de la fonction (option B, validée
  le 2026-09-12) — *Pourquoi* : affichage inchangé dans le cas courant d'un seul département, et
  cohérent avec « la demande suit la fonction » : on montre qui peut la traiter maintenant.
- **Écarté** : libellé de la fonction seul — *Raison* : perte du nom du département, même quand il
  n'y en a qu'un. **Écarté** : fonction + départements — *Raison* : trop long sur mobile.
- **Choix** : conserver la colonne `assignedDeptId` dans ce lot — *Pourquoi* : réversibilité
  (retour arrière du code possible), suppression différée à un `chore` avec migration.
- **Choix** : un département ayant une autre fonction est désactivé dans la liste plutôt que
  « déplacé » — *Pourquoi* : l'actuel déplacement silencieux retirerait un accès à une autre équipe
  sans avertissement ; pour changer, on le retire d'abord de sa fonction.
- **Pas d'ADR** : décision limitée à cette feature, sans nouveau pattern transverse.

## Risques & points d'attention

- **Équivalence des files** : la file Secrétariat passe de `assignedDeptId = secrétariat` à
  `type ∈ SECRETARIAT`. Les demandes créées alors qu'aucun Secrétariat n'était configuré
  (`assignedDeptId` null) **apparaîtront** désormais dans la file — conforme à l'intention, mais
  à vérifier en recette par une requête de contrôle (demandes dont `assignedDept.function` ne
  correspond pas à `functionForRequestType(type)`, attendu : uniquement des `null`).
- **Retour arrière** : un rollback du code après création de demandes (`assignedDeptId` null) les
  rendrait invisibles des anciennes files. Mitigation : script SQL de backfill documenté dans la PR.
- **Élargissement d'accès** : une demande devient traitable par tous les départements de la
  fonction, y compris un département ajouté après sa création — voulu (spec), à signaler aux admins.
- **Dépendance** : #561 doit être mergée avant (même zone du layout).
- **Audio** : `isCaptureTeamLead` (dépublication) s'étend aux responsables de chaque département
  de captation — cohérent avec la spec, à mentionner dans CLAUDE.md.
- **Documentation** : CLAUDE.md (« le département de captation » au singulier), `docs/auth.md`,
  guide utilisateur de la page fonctions.

## Stratégie de tests

- `src/lib/__tests__/function-departments.test.ts` : 0 / 1 / N départements, isolation par église,
  ordre déterministe, intersection d'appartenance.
- `src/lib/__tests__/department-functions.test.ts` : `REQUEST_TYPE_FUNCTION` couvre **tous** les
  membres de l'enum `RequestType` (test d'exhaustivité, casse si un type est ajouté sans routage).
- `/api/departments/[departmentId]` PATCH : assigner une fonction ne modifie aucun autre département.
- `/api/requests/[id]` GET/PATCH : membre d'un 2ᵉ département de la fonction → 200 ; membre d'un
  département retiré → 403 ; auteur et manager inchangés.
- Audio `access.test` : membre/responsable d'un 2ᵉ département de captation → accès.
- Relances intégration/MSDP : deux départements, une personne dans les deux → une seule notification.
- Affichage du destinataire : 1 département → son nom ; 2 → noms triés séparés par une virgule ;
  0 → « Secrétariat (non configuré) » ; une seule requête de départements pour N demandes.
- `/api/announcements` POST : fonction portée par 2 départements → création OK, sans `assignedDeptId`.
- Non-régression : suites existantes des files et de la trame inchangées ; `npm run build` avant
  déploiement (frontière client/serveur : `department-functions.ts` doit rester sans import serveur).
