# Tâches — Pastille « nouvelles offres » dans le menu

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : À faire

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/badge-nouvelles-offres`
- [ ] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [ ] **T1** — Ajouter le modèle `JobLastSeen` (`userId @id`, `seenAt DateTime @default(now())`,
      relation `User`) et la relation inverse `jobLastSeen JobLastSeen?` sur `User`
      *(fichier : `prisma/schema.prisma`)*
- [ ] **T2** — Générer la migration (`npm run db:migrate`, nom `add_job_last_seen`) — jamais `db push`

### 2. API

- [ ] **T3** — `GET /api/jobs/unseen-count` : `requireAuth()`, calcule `since` (dernière visite ou
      `now() - 30j`), compte les `JobOffer` `PUBLISHED` avec `authorId != session.user.id` et
      `createdAt > since`, renvoie `{ count }` *(fichier : `src/app/api/jobs/unseen-count/route.ts`)*
- [ ] **T4** — `POST /api/jobs/unseen-count` : `requireAuth()`, `upsert` de `JobLastSeen` pour
      l'utilisateur courant (`seenAt: now()`), renvoie `{ ok: true }`
      *(fichier : `src/app/api/jobs/unseen-count/route.ts`, même fichier que T3)*
- [ ] **T5** — Déclarer la route dans le manifeste du module emploi
      *(fichier : `src/modules/jobs/manifest.ts`, `routes.api`)*

### 3. UI — composant partagé

- [ ] **T6** [P] — Créer `Badge` (`count: number`, rend `null` si `count <= 0`, plafonne
      l'affichage à `9+`, couleur `icc-rouge` alignée sur `NotificationBell`)
      *(fichier : `src/components/ui/Badge.tsx`)*

### 4. UI — centralisation du compteur

- [ ] **T7** — État `jobsUnseenCount`, sondage au montage + toutes les 60 s
      (`fetch GET /api/jobs/unseen-count`) *(fichier : `src/components/AuthLayoutShell.tsx`)*
- [ ] **T8** — Sur `pathname === "/jobs"` avec `jobsUnseenCount > 0` : `POST` puis remise à zéro
      immédiate de l'état *(fichier : `src/components/AuthLayoutShell.tsx`, même fichier que T7)*
- [ ] **T9** — Transmettre `jobsUnseenCount` à `Sidebar` et `MobileNavSheet`
      *(fichier : `src/components/AuthLayoutShell.tsx`, même fichier que T7/T8)*

### 5. UI — barre latérale

- [ ] **T10** [P] — Prop `badge?: React.ReactNode` sur `AccordionSection` (affichée uniquement
      quand la section est repliée, `!open`) et sur `NavLink` (affichée après `children`)
      *(fichier : `src/components/Sidebar.tsx`)*
- [ ] **T11** — Nouvelle prop `jobsUnseenCount?: number` sur `Sidebar` ; passer `<Badge
      count={jobsUnseenCount} />` au `NavLink` `/jobs` (menu complet, section *Ressources*) et à
      l'`AccordionSection` *Ressources* *(fichier : `src/components/Sidebar.tsx`)*
- [ ] **T12** — Même pastille sur la section *Emploi* et son lien *Offres* du menu pastoral
      simplifié *(fichier : `src/components/Sidebar.tsx`)*

### 6. UI — menu mobile

- [ ] **T13** [P] — Prop `badge?: React.ReactNode` sur `RootRow` et `SubRow`
      *(fichier : `src/components/MobileNavSheet.tsx`)*
- [ ] **T14** — Nouvelle prop `jobsUnseenCount?: number` sur `MobileNavSheet` ; badge sur le
      `RootRow` *Ressources* (vue racine) et le `SubRow` *Offres* (`renderRessources`)
      *(fichier : `src/components/MobileNavSheet.tsx`)*

### 7. Tests

- [ ] **T15** [P] — Tests de la route `unseen-count` (première visite = fenêtre 30 jours ;
      offres de l'utilisateur exclues ; offres `ARCHIVED` exclues ; `POST` puis `GET` suivant
      renvoie `0`) *(fichier : `src/app/api/jobs/__tests__/unseen-count.test.ts`)*

## Vérification manuelle

- [ ] Publier une offre avec un second compte : la pastille apparaît sur *Ressources* (repliée
      et ouverte) et sur *Emploi* (vue pastorale), desktop et mobile
- [ ] Ouvrir `/jobs` : la pastille disparaît immédiatement
- [ ] Republier 10 offres : la pastille affiche « 9+ »
- [ ] Une offre qu'on a soi-même publiée n'incrémente pas son propre compteur

## Vérification finale

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run lint:boundaries`
- [ ] `npm run test`
- [ ] Tous les critères d'acceptation de `spec.md` satisfaits
- [ ] PR ouverte vers `main`
