# Plan technique — Pastille « nouvelles offres » dans le menu

- **Spec associée** : `./spec.md`
- **Statut** : Implémentée
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : le nouveau modèle et les nouvelles routes vivent dans le module
      `jobs` (déjà déclaré dans `src/modules/jobs/manifest.ts`) ; aucun import cross-module ajouté
- [x] **Sécurité** : routes protégées par `requireAuth()`, à l'image de `GET /api/jobs` existant
      (le module emploi est transversal, sans `churchId` — voir manifeste) ; aucune donnée
      d'église exposée
- [x] **Permissions** : aucune nouvelle permission (le compteur suit `jobs:view`, déjà accordée à
      tous les rôles — pas de contrôle de permission supplémentaire nécessaire, comme pour
      `GET /api/jobs`)
- [x] **Validation** Zod : la route POST ne prend aucun corps ; rien à valider
- [x] **Migration** Prisma prévue (`npm run db:migrate`, jamais `db push`)
- [x] **Enums** : sans objet (aucun nouvel enum)
- [x] **UI** : nouveau composant `src/components/ui/Badge.tsx` (aucun composant de pastille
      existant), réutilisé partout où le compteur s'affiche

## Approche générale

Un modèle minimal enregistre, par utilisateur, la date de sa dernière visite de `/jobs`. Une
route calcule le nombre d'offres publiées depuis cette date (hors les siennes) ; une autre
remet la date à jour quand l'utilisateur ouvre la page. `AuthLayoutShell` (déjà client,
déjà monté une fois au-dessus de `Sidebar`/`MobileNavSheet`/`BottomNav`) centralise l'appel
réseau et la remise à zéro, pour éviter de dupliquer le polling dans chaque composant de menu,
et transmet le compte en prop — même schéma que `hasJobs`, `hasAccounting`, etc.

## Modèle de données

```prisma
/// Dernière visite de l'utilisateur sur la page Offres — sert uniquement à calculer la pastille
/// "nouvelles offres" du menu (spec 042). Indépendant du système de notifications (hors périmètre).
model JobLastSeen {
  userId String   @id
  seenAt DateTime @default(now())
  user   User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("job_last_seen")
}
```

Ajout de la relation inverse sur `User` (aux côtés de `jobOffers`, `jobSeekers`,
`jobNotificationSubscription`) :
```prisma
jobLastSeen JobLastSeen?
```

Migration : `npm run db:migrate` (nom suggéré `add_job_last_seen`).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/jobs/unseen-count` | GET | `requireAuth()` (transversal, comme `GET /api/jobs`) | — | `{ count: number }` |
| `/api/jobs/unseen-count` | POST | `requireAuth()` | — | `{ ok: true }` |

- **GET** : `since = JobLastSeen.seenAt` de l'utilisateur, ou `now() - 30 jours` si aucune ligne
  (première visite — critère d'acceptation « pas tout l'historique »). Compte les
  `JobOffer` avec `status: "PUBLISHED"`, `authorId != session.user.id`, `createdAt > since`.
  Le plafond d'affichage « 9+ » est un détail de présentation, géré côté client (comme
  `NotificationBell`), pas dans la réponse API.
- **POST** : `upsert` de `JobLastSeen` pour l'utilisateur courant, `seenAt: now()`. Appelée par
  `AuthLayoutShell` à l'entrée sur `/jobs` (pas sur `/admin/jobs`, page de modération distincte).

## Services / logique métier

Pas de nouveau module de service dédié : la logique (deux requêtes Prisma courtes) reste dans
les route handlers, à l'image de `src/app/api/jobs/route.ts` qui n'a pas de couche service
séparée.

## UI / composants

### `src/components/ui/Badge.tsx` (nouveau)
Petit composant de présentation, réutilisable :
```tsx
export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1
      rounded-full bg-icc-rouge text-white text-[10px] font-semibold leading-none">
      {count > 9 ? "9+" : count}
    </span>
  );
}
```
(Couleur `icc-rouge` — cohérente avec le badge déjà utilisé par `NotificationBell` pour un
compteur d'attention ; à vérifier/aligner sur celui-ci en implémentation.)

### `src/components/AuthLayoutShell.tsx`
- État `jobsUnseenCount` (nombre), initialisé à `0`.
- `useEffect` au montage + `setInterval` 60s (mêmes constantes que `NotificationBell`) :
  `fetch("/api/jobs/unseen-count")` → `setJobsUnseenCount(count)`.
- `useEffect` sur `pathname` : si `pathname === "/jobs"` et `jobsUnseenCount > 0`, POST
  `/api/jobs/unseen-count` puis `setJobsUnseenCount(0)` (retour immédiat, sans attendre le
  prochain sondage).
- Transmet `jobsUnseenCount` à `Sidebar` et `MobileNavSheet`.

### `src/components/Sidebar.tsx`
- Nouvelle prop `jobsUnseenCount?: number`.
- Menu complet : `NavLink` `/jobs` (section *Ressources*) affiche `<Badge count={jobsUnseenCount} />`
  après le libellé « Offres » ; l'en-tête `AccordionSection` *Ressources* affiche la même pastille
  quand la section est repliée (`!open`).
- Menu pastoral simplifié : même traitement sur la section *Emploi* et son lien *Offres*
  (la spec ne l'exclut pas — contrairement à 039, ici le menu pastoral montre déjà la Comptabilité
  et doit montrer la pastille).
- `AccordionSection` gagne une prop `badge?: React.ReactNode`, rendue entre le titre et le chevron
  — repliée uniquement (`{!open && badge}`), pour ne pas doubler l'information une fois ouverte.
- `NavLink` gagne une prop `badge?: React.ReactNode`, rendue après `children`.

### `src/components/MobileNavSheet.tsx`
- Même prop `jobsUnseenCount?: number`.
- `RootRow` « Ressources » (vue racine) et `SubRow` « Offres » (vue `renderRessources`) affichent
  la pastille — `RootRow`/`SubRow` gagnent une prop `badge?: React.ReactNode` sur le même principe.

### `src/app/(auth)/layout.tsx`
- Aucun changement : le compteur est calculé côté client (il doit se mettre à jour en direct sans
  rechargement complet, impossible avec un calcul server-side dans un layout qui n'est pas
  ré-exécuté à chaque navigation client).

## Décisions & alternatives écartées

- **Choix** : centraliser le fetch/reset dans `AuthLayoutShell` plutôt que dans chaque composant
  de menu — *Pourquoi* : `Sidebar`, `MobileNavSheet` (et implicitement leurs variantes desktop/
  mobile) sont montés simultanément ; un fetch par composant tripler(ait) les appels et risquerait
  des remises à zéro incohérentes entre eux.
- **Écarté** : calculer le compteur côté serveur dans `src/app/(auth)/layout.tsx` — *Raison* : ce
  layout n'est pas ré-exécuté à la navigation client vers `/jobs` (Next.js App Router ne
  ré-invoque pas un layout partagé qui ne change pas de segment), la pastille ne se remettrait
  donc jamais à zéro sans rechargement complet de page.
- **Écarté** : passer par le système de notifications existant (`Notification` + `NotificationBell`)
  — *Raison* : explicitement hors périmètre de la spec (elle ne doit pas créer d'entrée dans la
  cloche ni déclencher d'e-mail) ; le compteur doit rester un simple calcul dérivé, pas un flux
  de notifications persistées par offre × utilisateur (coûteux et hors sujet).
- **Choix** : fenêtre de 30 jours pour la première visite (pas de ligne `JobLastSeen`) — *Pourquoi*
  : reprend le défaut proposé et validé dans `spec.md`.

## Risques & points d'attention

- **Cohérence multi-onglets/appareils** : si l'utilisateur ouvre `/jobs` sur un appareil, l'autre
  se met à jour au prochain sondage (jusqu'à 60s de décalage) — acceptable, comme pour les
  notifications.
- **Offres retirées entre le calcul et l'affichage** : le compteur peut légèrement varier entre le
  GET et l'ouverture réelle de la page (fenêtre de quelques secondes) — sans conséquence, la
  pastille se corrige au sondage suivant.
- **Double montage clients (Sidebar + MobileNavSheet)** : les deux consomment la même prop
  `jobsUnseenCount`, un seul fetch en amont — pas de désynchronisation possible entre les deux.

## Stratégie de tests

- **Route API** (Vitest, mocks Prisma comme les autres routes `api/jobs/__tests__/`) :
  - première visite (aucun `JobLastSeen`) : ne compte que les offres des 30 derniers jours
  - offres de l'utilisateur exclues du compte
  - offres non publiées (`ARCHIVED`) exclues
  - `POST` crée/`upsert` la ligne et le `GET` suivant retombe à `0`
- **`Badge`** : le projet n'a pas de bibliothèque de test de rendu (`@testing-library/react`
  absente, aucun test existant sous `components/ui/`) — pas de nouveau test de rendu, cohérent
  avec l'existant ; la logique de plafond « 9+ » est déjà exercée indirectement par les tests de
  la route API (assertions sur `count`).
- `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test`.
- **Vérification manuelle** : publier une offre avec un second compte de test, constater la
  pastille sur *Ressources* (repliée et ouverte) et sur *Emploi* (vue pastorale), l'ouvrir,
  constater sa disparition ; republier 10 offres, constater « 9+ ».
