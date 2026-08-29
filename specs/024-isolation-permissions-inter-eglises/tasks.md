# Tâches — Isolation inter-églises des contrôles de permission

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Les tâches `[P]` sont parallélisables.
>
> ⚠️ **Ordre imposé par la méthode** : T2 (suppression de `requirePermission`) casse
> volontairement la compilation. `npm run typecheck` devient alors la **liste de travail
> vivante** — chaque erreur est un appel à requalifier, et la compilation ne repasse au vert
> qu'une fois T4→T8 terminées. Ne pas chercher à garder le vert entre T2 et T8.
>
> ⚠️ **Aucun remplacement automatisé.** La catégorie d'un appel ne se déduit pas de la
> permission demandée : elle dépend de ce sur quoi la route agit. Chaque site est requalifié
> individuellement, en lisant la route.

## Prérequis

- [x] Branche créée : `fix/isolation-permissions-inter-eglises`
- [x] Migration Prisma : **aucune** (pas de changement de schéma)

## Tâches

### 1. Données & migration

*Aucune tâche — le défaut est entièrement dans la couche d'autorisation.*

### 2. Logique métier (gardes d'autorisation)

- [ ] **T1** — Ajouter les trois gardes explicites, sans encore rien supprimer, pour que les
      appelants aient une cible avant la migration : *(fichier : `src/lib/auth.ts`)*
  - `requireCurrentChurchPermission(permission)` → résout le contexte d'église courant puis
    délègue à `requireChurchPermission` ; retourne `{ session, churchId }`. Ne doit **jamais**
    retourner un `churchId` sur lequel la permission n'a pas été vérifiée.
  - `requireSuperAdmin()` → administration plateforme.
  - `requirePlatformPermission(permission)` → domaine transverse, avec liste blanche des
    permissions autorisées (module emploi uniquement).
- [ ] **T2** — Supprimer `requirePermission` et documenter dans le commentaire de
      `getCurrentChurchId` qu'il retourne un **contexte d'affichage, jamais une
      autorisation**. *(fichier : `src/lib/auth.ts`)*

### 3. API (route handlers) — requalification des 23 appels

- [ ] **T3** [P] — **Accueil** (7 appels) → `requireCurrentChurchPermission("events:manage")`.
      *(fichiers : `src/app/api/welcome-duty/{suggestions,available-families,families,families/[id],assignments,assignments/[id]}/route.ts`, `src/app/(auth)/admin/welcome-duty/page.tsx`)*
- [ ] **T4** [P] — **Comptabilité** (6 appels) → contexte courant ; pour les routes agissant
      sur un objet identifié, résoudre l'église **depuis l'objet**.
      *(fichiers : `src/app/api/accounting/{attachments,requests,series,series/[id]}/route.ts`)*
- [ ] **T5** [P] — **Réservations de salles** (4 appels) → `mrbs:manage` sur l'église courante.
      *(fichiers : `src/app/api/admin/mrbs-links/route.ts`, `src/app/(auth)/admin/mrbs-links/page.tsx`)*
- [ ] **T6** [P] — **Audio (paramètres)** (3 appels) → `audio:manage` sur l'église courante.
      *(fichiers : `src/app/api/audio/settings/route.ts`, `src/app/api/audio/settings/cover/sign/route.ts`)*
- [ ] **T7** [P] — **Administration plateforme** (4 appels `church:manage`) → `requireSuperAdmin()`.
      *(fichiers : `src/app/(auth)/admin/churches/page.tsx`, `src/app/(auth)/admin/churches/[churchId]/page.tsx`, `src/app/(auth)/admin/churches/onboard/page.tsx`, `src/app/(auth)/admin/audit-logs/page.tsx`)*
- [ ] **T8** [P] — **Module emploi** (4 appels) → `requirePlatformPermission(...)`. Ne pas
      rattacher à une église : ces modèles n'ont pas de `churchId`, la portée transverse est
      voulue. *(fichiers : `src/app/api/jobs/route.ts`, `src/app/api/jobs/seekers/route.ts`, `src/app/api/jobs/freelance/{missions,profiles}/route.ts`)*
- [ ] **T9** — Vérifier que `npm run typecheck` repasse au **vert** : plus aucun appelant
      orphelin, donc migration exhaustive prouvée par le compilateur.

### 4. UI

- [ ] **T10** — Restreindre le calcul des droits d'affichage aux rôles détenus **dans
      l'église courante** (aujourd'hui `churchRoles.map(...)` agrège toutes les églises, ce
      qui affiche les liens d'administration de A dans le contexte de B). Conserver l'accès
      global du Super Admin et les permissions de lecture pastorale.
      *(fichier : `src/app/(auth)/layout.tsx`)*

### 5. Tests

- [ ] **T11** — Socle de session factice **deux églises** : rôle privilégié dans A, rôle
      moindre dans B. Réutilisé par les cas suivants.
      *(fichier : `src/lib/__tests__/auth-multitenant.test.ts`)*
- [ ] **T12** — **Isolation (cœur)** : refus dans B avec une permission détenue seulement
      dans A ; succès dans A. En **lecture** comme en **écriture**. *(même fichier)*
- [ ] **T13** [P] — **Non-régression mono-église** : une session à une seule église conserve
      exactement ses accès. *(même fichier)*
- [ ] **T14** [P] — **Super Admin** : accès conservé sur A comme sur B. *(même fichier)*
- [ ] **T15** — **Supervision pastorale** : lecture autorisée sur l'église supervisée ;
      **écriture refusée**, y compris avec un rôle privilégié dans une autre église.
      ⚠️ Ce test doit **échouer sur le code actuel** — le vérifier avant T2 vaut preuve du
      défaut. *(même fichier)*
- [ ] **T16** [P] — **Contexte manipulé** : un contexte d'église sans rattachement ne devient
      jamais le périmètre de l'action. *(même fichier)*
- [ ] **T17** [P] — **Absence de fuite** : le refus dans B est indiscernable de celui opposé à
      une session sans aucun droit (même erreur, même message). *(même fichier)*
- [ ] **T18** — **Portées globales énumérables** : test comparant les appels aux gardes
      globales (`requireSuperAdmin`, `requirePlatformPermission`) à une liste blanche
      commitée ; tout nouvel usage fait échouer la suite tant qu'il n'est pas justifié.
      *(fichier : `src/lib/__tests__/auth-global-scopes.test.ts`)*

### 6. Documentation

- [ ] **T19** [P] — Mettre à jour la section « Helpers d'authentification » de `CLAUDE.md` et
      `docs/auth.md` : `requirePermission` n'existe plus, les trois gardes le remplacent, et
      le critère de choix entre elles. *(fichiers : `CLAUDE.md`, `docs/auth.md`)*

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] **Avant déploiement** : signaler aux utilisateurs concernés que les profils pastoraux
      repassent en lecture seule stricte sur les églises supervisées (un usage réel s'appuie
      peut-être sur le défaut actuel — cf. risques du plan)
- [ ] PR ouverte vers `main`

## Couverture des critères d'acceptation

| Critère de `spec.md` | Tâche(s) |
|---|---|
| Aucune action dans B excédant les droits dans B | T1, T3–T8, T12 |
| Vaut en lecture comme en écriture | T12 |
| Refus indiscernable (pas de fuite) | T17 |
| Contrôle sans église impossible à exprimer | T2, T9 |
| Portées globales énumérables | T7, T8, T18 |
| Contexte navigateur sans rattachement sans effet | T16 |
| L'église de l'objet fait autorité | T4 |
| Mono-église : aucun changement | T13 |
| Super Admin : accès global conservé | T7, T14 |
| Tests deux églises / deux rôles | T11, T12 |
| Pastoral : aucune écriture sur église supervisée | T15 |
| Modules touchés tous couverts | T3–T8 |
| Actions non autorisées non proposées | T10 |
