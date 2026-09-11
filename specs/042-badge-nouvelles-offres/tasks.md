# Tâches — Pastille « nouvelles offres » dans le menu

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/badge-nouvelles-offres`
- [x] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter le modèle `JobLastSeen` (`userId @id`, `seenAt DateTime @default(now())`,
      relation `User`) et la relation inverse `jobLastSeen JobLastSeen?` sur `User`
      *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration (`npm run db:migrate`, nom `add_job_last_seen`) — jamais `db push`

### 2. API

- [x] **T3** — `GET /api/jobs/unseen-count` : `requireAuth()`, calcule `since` (dernière visite ou
      `now() - 30j`), compte les `JobOffer` `PUBLISHED` avec `authorId != session.user.id` et
      `createdAt > since`, renvoie `{ count }` *(fichier : `src/app/api/jobs/unseen-count/route.ts`)*
- [x] **T4** — `POST /api/jobs/unseen-count` : `requireAuth()`, `upsert` de `JobLastSeen` pour
      l'utilisateur courant (`seenAt: now()`), renvoie `{ ok: true }`
      *(fichier : `src/app/api/jobs/unseen-count/route.ts`, même fichier que T3)*
- [x] **T5** — ~~Déclarer la route dans le manifeste du module emploi~~ — non nécessaire :
      `routes.api` du module déclare déjà le préfixe `/api/jobs`, qui couvre
      `/api/jobs/unseen-count` par correspondance de préfixe à la frontière du segment
      (`matchesPrefix()` dans `src/core/module-routes.ts`). Ajouter une déclaration séparée
      aurait été redondant *(fichier : `src/modules/jobs/manifest.ts`, inchangé)*

### 3. UI — composant partagé

- [x] **T6** [P] — Créer `Badge` (`count: number`, rend `null` si `count <= 0`, plafonne
      l'affichage à `9+`, couleur `icc-rouge` alignée sur `NotificationBell`)
      *(fichier : `src/components/ui/Badge.tsx`)*

### 4. UI — centralisation du compteur

- [x] **T7** — État `jobsUnseenCount`, sondage au montage + toutes les 60 s
      (`fetch GET /api/jobs/unseen-count`) *(fichier : `src/components/AuthLayoutShell.tsx`)*
- [x] **T8** — Sur `pathname === "/jobs"` avec `jobsUnseenCount > 0` : `POST` puis remise à zéro
      immédiate de l'état *(fichier : `src/components/AuthLayoutShell.tsx`, même fichier que T7)*
- [x] **T9** — Transmettre `jobsUnseenCount` à `Sidebar` et `MobileNavSheet`
      *(fichier : `src/components/AuthLayoutShell.tsx`, même fichier que T7/T8)*

### 5. UI — barre latérale

- [x] **T10** [P] — Prop `badge?: React.ReactNode` sur `AccordionSection` (affichée uniquement
      quand la section est repliée, `!open`) et sur `NavLink` (affichée après `children`)
      *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T11** — Nouvelle prop `jobsUnseenCount?: number` sur `Sidebar` ; passer `<Badge
      count={jobsUnseenCount} />` au `NavLink` `/jobs` (menu complet, section *Ressources*) et à
      l'`AccordionSection` *Ressources* *(fichier : `src/components/Sidebar.tsx`)*
- [x] **T12** — Même pastille sur la section *Emploi* et son lien *Offres* du menu pastoral
      simplifié *(fichier : `src/components/Sidebar.tsx`)*

### 6. UI — menu mobile

- [x] **T13** [P] — Prop `badge?: React.ReactNode` sur `RootRow` et `SubRow`
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [x] **T14** — Nouvelle prop `jobsUnseenCount?: number` sur `MobileNavSheet` ; badge sur le
      `RootRow` *Ressources* (vue racine), le `SubRow` *Offres* (`renderRessources`), et le
      `RootRow` *Emploi* du menu pastoral simplifié (`renderPastoralRoot`)
      *(fichier : `src/components/MobileNavSheet.tsx`)*

### 7. Tests

- [x] **T15** [P] — Tests de la route `unseen-count` (première visite = fenêtre 30 jours ;
      offres de l'utilisateur exclues ; offres `PUBLISHED` uniquement ; `POST` puis `GET` suivant
      renvoie `0`) *(fichier : `src/app/api/jobs/__tests__/unseen-count.test.ts`)*

## Vérification manuelle

> Non exécutée dans cette session (pas d'environnement de dev connecté à une base de données
> peuplée avec un navigateur) — à faire en recette avant de considérer la feature validée.

- [ ] Publier une offre avec un second compte : la pastille apparaît sur *Ressources* (repliée
      et ouverte) et sur *Emploi* (vue pastorale), desktop et mobile
- [ ] Ouvrir `/jobs` : la pastille disparaît immédiatement
- [ ] Republier 10 offres : la pastille affiche « 9+ »
- [ ] Une offre qu'on a soi-même publiée n'incrémente pas son propre compteur

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (par lecture du code — voir note
      ci-dessus pour la vérification manuelle en recette)
- [ ] PR ouverte vers `main`
