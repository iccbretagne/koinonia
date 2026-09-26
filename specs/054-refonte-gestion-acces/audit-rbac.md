# Audit RBAC — grille commentée (spec 054)

- **Date** : 2026-09-26
- **Source de vérité vérifiée** : manifestes `src/modules/*/manifest.ts` (agrégés par
  `buildRolePermissions`), croisés avec le test figé `src/core/__tests__/permissions.test.ts`,
  la matrice de `CLAUDE.md` / `docs/auth.md`, et les gardes réellement appelées dans le code.
- **Statut** : en revue — les décisions **D1 à D7** sont à trancher avant `/plan`.

> Document d'annexe technique : contrairement à `spec.md`, il nomme permissions, fichiers et
> gardes. Il alimente `plan.md` ; il ne le remplace pas.

Légende rôles : SA Super Admin · Ad Admin · Sec Secrétaire · Min Ministre · RD Resp. département ·
FD Faiseur de Disciples · Rep Reporter · STAR · RSP Référent soins pastoraux · Cpt Comptable.
Légende statut : ✅ cohérent · ⚠️ à trancher · ❌ défaut confirmé · 📝 doc à corriger.

---

## 1. Décisions à prendre

### D1 — `members:manage` (Min, RD) : garder tel quel ou scinder ?

**Constat** : c'est la permission « gérer les fiches STAR de mon périmètre ». Elle est aussi
utilisée comme raccourci pour « Admin » (intégration, parcours, `/api/users`) et, sur plusieurs
routes, sans le périmètre de département (doublons/fusion, liaison de comptes, STAR en masse,
demandes d'accès). Ces deux défauts sont déjà dans le lot 2 de la spec.

| Option | Effet |
|---|---|
| **A. Garder, appliquer le périmètre partout** *(recommandé)* | Aucune nouvelle permission. On retire tous les usages « raccourci Admin » (→ D2, D4) et on ajoute la garde de périmètre sur les 4 gestes du groupe B. |
| B. Scinder en `members:manage` (périmètre) + `members:admin` (global : doublons, fusion, STAR en masse) | Plus explicite, mais une permission de plus et un Ministre/RD perd la fusion même dans son périmètre. |

### D2 — `users:manage` est une permission morte

**Constat** : déclarée (SA seul), **utilisée nulle part**. La page `/admin/users` se garde par
`members:manage` **plus** un contrôle de rôle `ADMIN` codé en dur
(`src/app/(auth)/admin/users/page.tsx:13`, idem `users/new/page.tsx:12`) ; ses API
(`GET /api/users`, `DELETE /api/users/[userId]`) n'ont que `members:manage` → faille A3 de l'audit.

| Option | Effet |
|---|---|
| **A. Donner `users:manage` à SA + Ad et s'en servir** pour la page et les API *(recommandé)* | Supprime le rôle codé en dur et la faille d'un même geste ; la permission redevient vraie. |
| B. Supprimer `users:manage`, garder un contrôle de rôle `ADMIN` explicite dans les API | Moins de permissions, mais un contrôle de rôle codé en dur de plus. |

⚠️ Le commentaire du manifeste core décrit `users:manage` comme « plateforme, Super Admin
uniquement » : l'option A change ce sens (gestion des comptes **de l'église**). À acter.

### D3 — Qui valide les demandes d'accès et lie les comptes ?

**Constat** — deux écrans, deux règles, une API :

| Écran | Garde de l'écran | Qui voit les demandes |
|---|---|---|
| Accès & rôles, onglet Demandes (`/admin/access`) | `access:manage` (SA, Ad, **Sec**, Min borné au ministère) | filtré au ministère pour Min |
| STAR (`/admin/members`) | `members:manage` (SA, Ad, Min, **RD**) | **toute l'église**, sans filtre |

L'API de validation (`PATCH /api/member-link-requests/[id]`) et de liaison
(`/api/member-user-links`) exige `members:manage`, sans périmètre. Conséquences :
- ❌ **La Secrétaire voit les demandes dans « Accès & rôles » mais reçoit un refus en les
  validant** (elle n'a pas `members:manage`) — alors que la doc dit qu'elle « gère les accès au
  même titre qu'Admin ».
- ❌ Un RD valide depuis « STAR » les demandes de toute l'église (groupe B de la spec).

| Option | Effet |
|---|---|
| **A. Valider/lier = `access:manage` + périmètre** *(recommandé)* | Cohérent avec la doc (« valider les demandes → Accès & rôles ») ; la Secrétaire peut valider ; le Min reste borné à son ministère. **Le RD perd la validation** (il n'a pas `access:manage`) — il garde la création de fiches. |
| B. `access:manage` **ou** `members:manage`, avec périmètre dans les deux cas | Personne ne perd de geste ; le RD valide pour ses départements. Deux chemins à maintenir. |
| C. Statu quo + donner `members:manage` à la Secrétaire | Contredit « Secrétaire : membres en lecture seule » (CLAUDE.md). Déconseillé. |

### D4 — Le module `integration` n'a aucune permission

**Constat** : `permissions: {}`. Toutes ses gardes sont écrites à la main et reposent sur
`members:manage || events:manage` (4 copies : `modules/integration/auth.ts:44`,
`api/integration/parcours/route.ts:25` et `:45`, `api/integration/parcours/[id]/route.ts:15`).

| Option | Effet |
|---|---|
| **A. Déclarer `integration:manage` = SA, Ad, Sec** et l'utiliser à la place du raccourci *(recommandé)* | Même modèle que `care` ; le raccourci disparaît ; équipe (fonction INTEGRATION/MSDP) et bergers restent gérés par la garde, inchangés (décision de la spec). Une seule garde partagée au lieu de 4 copies. |
| B. Garder sans permission, remplacer le raccourci par une liste de rôles explicite | Rien dans la grille : l'accès reste invisible sur la fiche personne (contraire à l'esprit de la spec). |

### D5 — `discipleship:export` : l'Admin n'y a pas droit

**Constat** : SA + Sec seulement ; ni l'Admin ni le FD. Aucune justification trouvée dans
l'historique (la valeur date d'avant le découpage en modules ; le CHANGELOG initial la donnait
même au FD). L'Admin a pourtant `discipleship:manage`.

| Option | Effet |
|---|---|
| **A. Ajouter Ad** *(recommandé)* | Aligne l'Admin sur la Secrétaire. |
| B. Statu quo, documenter pourquoi | Si c'est volontaire (données sensibles réservées au secrétariat), l'écrire dans `docs/auth.md`. |

### D6 — `discipleship:view` pour le Ministre : le code et la doc divergent

**Constat** : manifeste **et** test figé donnent `discipleship:view` au Min ;
`CLAUDE.md` et `docs/auth.md:240` disent le contraire. En pratique le Ministre n'est pas un
rôle global pour le discipolat (`GLOBAL_ROLES` = SA, Ad, Sec) : il ne voit que les relations où
il est lui-même faiseur de disciples.

| Option | Effet |
|---|---|
| **A. Corriger la doc** (le Min a bien `discipleship:view`, limité à ses propres disciples) *(recommandé)* | Aucun changement de comportement. |
| B. Retirer la permission au Min | Aligne sur la doc, mais un Ministre qui est aussi FD perd sa vue… sauf s'il porte aussi le rôle FD. |

### D7 — `rooms:reserve` : la Secrétaire voit les salles mais ne peut pas réserver

**Constat** : `rooms:view` inclut Sec, `rooms:reserve` non. Documenté tel quel, sans
justification. Question de métier : le secrétariat réserve-t-il des salles pour l'église ?

| Option | Effet |
|---|---|
| A. Ajouter Sec à `rooms:reserve` | Si le secrétariat organise des réservations. |
| **B. Statu quo** *(recommandé par défaut, faute d'information)* | La réservation reste aux responsables. |

---

## 2. Grille complète

| Permission | SA | Ad | Sec | Min | RD | FD | Rep | STAR | RSP | Cpt | Statut | Commentaire |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `church:manage` | x | | | | | | | | | | ✅ | Plateforme. |
| `users:manage` | x | | | | | | | | | | ❌ | **Morte** — jamais vérifiée. → D2 |
| `access:manage` | x | x | x | x | | | | | | | ⚠️ | Min borné au ministère (route des rôles + page). Ne couvre pas la validation des demandes d'accès → D3 |
| `planning:view` | x | x | x | x | x | | | x | | | ✅ | |
| `planning:edit` | x | x | | x | x | | | | | | ✅ | Sert aussi à « déposer une demande » (écran et API cohérents). Sec en lecture seule, voulu. |
| `planning:department` | x | x | x | x | x | | | | | | ✅ | STAR exclu (spec 031). |
| `members:view` | x | x | x | x | x | | | | | | ✅ | Périmètre appliqué (`/api/members*`). |
| `members:manage` | x | x | | x | x | | | | | | ❌ | Raccourci « Admin » (intégration, parcours, `/api/users`) + périmètre manquant sur 4 gestes. → D1, D2, D3, D4 |
| `events:view` | x | x | x | x | x | | x | | | | ✅ | |
| `events:manage` | x | x | x | | | | | | | | ⚠️ | Sert de raccourci « Admin/Sec » à ~15 endroits, **sans sur-octroi aujourd'hui** (mêmes rôles). Fragile, documenté, non corrigé (décision spec). Reste utilisé par la garde intégration → D4 |
| `departments:view` | x | x | x | x | x | | | | | | ✅ | |
| `departments:manage` | x | x | | x | | | | | | | ✅ | Min gère les départements de son ministère. |
| `absences:view` | x | x | x | x | x | | | | | | ✅ | |
| `absences:manage` | x | x | x | x | x | | | | | | ✅ | |
| `reports:view` | x | x | x | | | | x | | | | ✅ | |
| `reports:edit` | x | x | x | | | | x | | | | ✅ | |
| `discipleship:view` | x | x | x | x | x | x | | | | | 📝 | **Min l'a** dans le code, pas dans la doc. Min/RD/FD limités à leurs propres disciples. → D6 |
| `discipleship:manage` | x | x | x | | | x | | | | | ✅ | |
| `discipleship:export` | x | | x | | | | | | | | ⚠️ | Admin exclu sans raison trouvée. → D5 |
| `audio:listen` | x | x | x | x | x | x | x | x | x | x | ✅ | Tous les rôles. |
| `audio:view` | x | x | x | | | | | | | | ✅ | + équipe de captation (garde du module). |
| `audio:upload` | x | x | x | | | | | | | | ✅ | idem. |
| `audio:review` | x | x | | | | | | | | | ✅ | idem. |
| `audio:manage` | x | x | | | | | | | | | ✅ | Dépublier : + responsable de l'équipe de captation uniquement. |
| `media:view` | x | x | x | | | | | | | | ✅ | + équipes Photos / Production Média / Communication. |
| `media:upload` | x | x | x | | | | | | | | ✅ | idem. |
| `media:review` | x | x | | | | | | | | | ✅ | idem. |
| `media:manage` | x | x | | | | | | | | | ✅ | idem. |
| `accounting:submit` | x | x | | x | x | | | | | | ✅ | |
| `accounting:view` | x | x | | x | x | | | | | x | ✅ | Min/RD limités à leur périmètre. |
| `accounting:manage` | x | x | | | | | | | | x | ✅ | |
| `accounting:stats` | x | x | x | | | | | | | x | ✅ | |
| `agenda:view` | x | x | x | | | | | | | | ✅ | + département fonction Protocole, + profil pastoral. |
| `agenda:manage` | x | x | x | | | | | | | | ✅ | + Protocole. |
| `care:qualify` | x | x | | | | | | | x | | ✅ | Pas de raccourci de rôle (vérifié). |
| `care:view` | x | x | x | | | | | | x | | ✅ | + accompagnant en charge, objet par objet. |
| `rooms:view` | x | x | x | x | x | | | | | | ✅ | |
| `rooms:reserve` | x | x | | x | x | | | | | | ⚠️ | Sec exclue. → D7 |
| `rooms:manage` | x | x | | | | | | | | | ✅ | |
| `jobs:view` / `post` / `seek` / `freelance` | x | x | x | x | x | x | x | x | x | x | ✅ | Transverses aux églises (liste blanche testée). |
| `jobs:manage` | x | x | x | | | | | | | | ✅ | |
| *(integration)* | — | — | — | — | — | — | — | — | — | — | ❌ | **Aucune permission déclarée** ; garde manuelle avec raccourci. → D4 |

---

## 3. Accès hors grille (gardes propres)

Ces accès n'apparaissent dans aucune permission : c'est ce que la fiche personne de la spec
devra afficher « en lecture seule, avec l'origine ».

| Mécanisme | Garde | Donne accès à | Statut |
|---|---|---|---|
| Département fonction `INTEGRATION` / `MSDP` | `requireIntegrationAccess` | Dossiers d'accueil, parcours (complet) | ❌ raccourci `members:manage` dans la même garde → D4 |
| Berger / co-berger affecté | `requireIntegrationAccess` (scope `familyIds`) | Ses familles, sans export | ✅ |
| Resp. d'un département `INTEGRATION` | `requireIntegrationSettingsAccess` | Délais de relance | ✅ exclut volontairement `members:manage` |
| Département fonction `CAPTATION_AUDIO` | `requireAudioAccess` | Tout l'espace production audio | ✅ |
| Resp./Min d'un département de captation | `requireAudioUnpublishAccess` | Dépublier | ✅ |
| Départements fonction `PHOTOS` / `PRODUCTION_MEDIA` / Communication | `isMediaTeamMember`, `requireMedia*Access` | Espace Communication & Production | ✅ |
| Département fonction Protocole | `requireAgendaView` / `requireAgendaManage` | Agenda pastoral | ✅ |
| Profil pastoral lié (sans rôle) | `PASTORAL_READ_PERMISSIONS` | Lecture : événements, discipolat, planning, membres, stats compta | ✅ |
| Accompagnant en charge (care) | `getCareAccess` | Ses demandes / suivis uniquement | ✅ |
| Équipe Secrétariat (spec 045) | rôle `SECRETARY` **virtuel** injecté en session | Tout ce qu'a la Secrétaire | ✅ à afficher comme « hérité », non retirable |
| Partage audio inter-églises | `requireAudioListenAccess` | Bibliothèque de l'église hôte | ✅ |

**Contrôles de rôle codés en dur** (hors permissions) :
- `/admin/users` et `/admin/users/new` : rôle `ADMIN` exigé en plus de `members:manage` → D2.
- `PATCH /api/users/[userId]/profile` : `SUPER_ADMIN`/`ADMIN`/`SECRETARY` en dur (renommer un
  utilisateur d'une église commune). Cohérent, mais invisible dans la grille — à basculer sur
  `users:manage` si D2-A est retenue.
- Route des rôles : `PRIVILEGED_ROLES` / `MINISTRY_SCOPED_ROLES` — anti-escalade, ✅ voulu.

---

## 4. Défauts confirmés (déjà dans le lot 2 de la spec)

| # | Où | Défaut | Qui en profite à tort |
|---|---|---|---|
| A1 | `modules/integration/auth.ts:44` | `members:manage` comme raccourci Admin | Tout Min / RD : dossiers d'accueil + export |
| A2 | `api/integration/parcours/route.ts:25,45`, `[id]/route.ts:15` | idem, garde copiée 3 fois | Tout Min / RD : lecture, création, modif, **suppression** de parcours |
| A3 | `api/users/route.ts:11`, `api/users/[userId]/route.ts:21` | API moins stricte que l'écran (ADMIN) | Tout Min / RD : liste des comptes + rôles ; suppression d'un compte préparé (même Admin/Sec) — contourne `PRIVILEGED_ROLES` |
| B1 | `admin/members/duplicates/page.tsx`, `api/admin/members/merge/route.ts:50` | Pas de périmètre | RD / Min : tous les membres (emails) + fusion de n'importe quelle paire |
| B2 | `api/admin/members/assign-star-roles/route.ts:12` | Pas de périmètre | RD / Min : rôle STAR en masse sur toute l'église |
| B3 | `api/member-user-links/route.ts:47,130` | Pas de périmètre | RD / Min : lier/délier n'importe quelle fiche |
| B4 | `api/member-link-requests/*`, `admin/members/page.tsx` | Pas de périmètre (et Sec bloquée) | RD : toutes les demandes d'accès → D3 |

## 5. Documentation à corriger (quelles que soient les décisions)

- `discipleship:view` du Ministre (`CLAUDE.md`, `docs/auth.md:240`) → D6.
- `users:manage` : sens réel à écrire une fois D2 tranchée.
- Mention des raccourcis `events:manage` comme fragiles (décision de la spec).
- Commentaire obsolète `api/discipleships/[id]/member/route.ts:15` (« admins (members:manage) »
  — la garde réelle est `discipleship:manage`).
- `docs/processus/arrivee-star.md` : cohérence avec D3 (qui valide les demandes d'accès).
