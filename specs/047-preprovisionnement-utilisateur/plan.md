# Plan technique — Pré-provisionnement d'un utilisateur par e-mail

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-09-13

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : le nouvel écran et les modifications d'API restent dans le
      périmètre déjà déclaré par le module `planning` (`/admin/users`, `/api/member-user-links`) —
      aucun nouvel import cross-module.
- [x] **Sécurité** : route protégée par `requireChurchPermission("members:manage", churchId)`,
      identique à l'existant ; `churchId` jamais optionnel.
- [x] **Permissions** via `rolePermissions` — aucune permission nouvelle, réutilise `members:manage`.
- [x] **Validation** Zod sur la mutation étendue.
- [x] **Migration** Prisma : **aucune** (voir Modèle de données ci-dessous).
- [x] **Enums** : aucun nouvel enum nécessaire.
- [x] **UI** : réutilise `Modal`, `Input`, `Select`, `Button`, `CheckboxGroup` de `src/components/ui/`.

## Approche générale

Le mécanisme de création d'un compte par e-mail et de rattachement immédiat à une fiche STAR
existe déjà (spec 037, `admitToChurch`) — ce plan ne le réécrit pas, il le **rend accessible et
visible** :

1. Étendre `POST /api/member-user-links` pour accepter la création d'une **nouvelle** fiche STAR
   dans le même appel (`newMember`), en déléguant à `admitToChurch` qui le sait déjà faire —
   aujourd'hui cette capacité existe côté service mais aucune route ne l'expose avec `email`.
2. Ajouter un nouvel écran `/admin/users/new` (« Créer un utilisateur ») qui appelle cette route
   avec `email` + `confirmCreate: true` + (`memberId` existant **ou** `newMember`).
3. Dériver le statut « jamais connecté » **sans nouveau champ** : un `User` sans aucune ligne
   `Account` liée n'a jamais terminé de connexion Google — l'adaptateur NextAuth crée la ligne
   `Account` au premier `signIn` réussi, jamais avant. `GET /api/users` et la page `/admin/users`
   exposent ce dérivé (`neverConnected: boolean`) sans toucher au schéma.
4. Le retrait d'un compte jamais connecté réutilise la suppression déjà possible (aucun nouveau
   endpoint) : `DELETE /api/member-user-links` retire le lien ; si le compte n'a ni rôle utile ni
   connexion, un Admin peut le supprimer via l'écran utilisateurs existant (extension mineure, pas
   de nouvelle route de suppression de `User`).

## Modèle de données

`[Aucun changement]` — le statut « jamais connecté » se déduit de `User.accounts` (relation déjà
existante), pas d'un champ stocké. Pas de migration.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/member-user-links` | POST | `members:manage` (`churchId`) | `{ churchId, email, confirmCreate: true, newMember?: { firstName, lastName, phone?, departmentId }, memberId? }` (`newMember` et `memberId` mutuellement exclusifs, comme aujourd'hui `userId`/`email`) | `MemberUserLink` créé (`201`), inchangé sinon |
| `/api/users` | GET | `members:manage` (`churchId`) | *(inchangé)* | ajoute `neverConnected: boolean` par utilisateur (`accounts.length === 0`) |
| `/api/users/[userId]` | DELETE *(nouveau)* | `members:manage` (`churchId` du seul rôle de l'utilisateur dans cette église) | — | Supprime le `User` **uniquement si** : aucune connexion (`accounts.length === 0`) et aucun rôle hors de cette église (sinon `409`) |

Le schéma Zod de `POST /api/member-user-links` s'étend ainsi (`newMember` calqué sur
`AdmitToChurchInput.newMember`, déjà validé côté service) :

```ts
const createSchema = z
  .object({
    churchId: z.string(),
    memberId: z.string().optional(),
    newMember: z
      .object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        departmentId: z.string(),
      })
      .optional(),
    userId: z.string().optional(),
    email: z.string().trim().email().optional(),
    confirmCreate: z.boolean().optional(),
  })
  .refine((d) => d.userId ?? d.email, { message: "userId ou email requis" })
  .refine((d) => (d.memberId ? !d.newMember : true), { message: "memberId et newMember sont exclusifs" })
  .refine((d) => d.memberId ?? d.newMember, { message: "memberId ou newMember requis" });
```

## Services / logique métier

- `admitToChurch` (`src/lib/admission.ts`) : **aucun changement** — accepte déjà `newMember`, il
  suffit que la route le transmette.
- `POST /api/member-user-links` : la branche `newMember` saute la vérification
  `member.findFirst` (pas de `memberId` à valider) et passe directement `input.newMember` à
  `admitToChurch` à l'intérieur de la transaction existante ; le contrôle de doublon
  (`existingByMember`) ne s'applique qu'avec un `memberId` fourni — une nouvelle fiche ne peut pas
  déjà avoir de lien.
- `GET /api/users` : ajoute `_count: { select: { accounts: true } }` à l'`include` Prisma, dérive
  `neverConnected: count === 0` avant `successResponse`.
- Suppression (`DELETE /api/users/[userId]`, nouveau) : charge l'utilisateur avec `accounts`,
  `sessions`, `churchRoles` ; refuse (`409`) si `accounts.length > 0` ou si un `churchRoles` porte
  sur une autre église que `churchId` ; sinon supprime en cascade (`UserChurchRole`,
  `MemberUserLink`, `User`) dans une transaction, avec `logAudit`.

## UI / composants

- **`/admin/users/new/page.tsx`** (Server Component) : charge `members` sans lien existant
  (`memberUserLink: null`) pour l'église courante + `departments` (pour la création d'une nouvelle
  fiche), protégé par le même garde que `/admin/users`.
- **`CreateUserClient.tsx`** (Client Component) : formulaire avec
  - un `Input` e-mail,
  - un choix (deux `Button`/onglets) : « Lier à une fiche STAR existante » (recherche parmi les
    membres sans compte, réutilise le pattern de recherche de `MembersClient`) ou « Créer une
    nouvelle fiche STAR » (Inputs prénom/nom/téléphone + `Select` département, mêmes champs que
    `admitToChurch.newMember`),
  - soumission vers `POST /api/member-user-links`.
- **`/admin/users/page.tsx` + `UsersClient.tsx`** :
  - ajoute un bouton « + Créer un utilisateur » en haut de la liste, lien vers `/admin/users/new`,
  - `UserItem` gagne `neverConnected: boolean`,
  - un badge (`bg-amber-50 text-amber-700`, cohérent avec les badges existants) « Jamais connecté »
    à côté du nom quand `neverConnected` est vrai,
  - action « Supprimer » (icône poubelle, confirmation) visible **uniquement** si
    `neverConnected` — appelle `DELETE /api/users/[userId]`.

## Décisions & alternatives écartées

- **Choix** : étendre `POST /api/member-user-links` plutôt que créer un endpoint dédié
  (`POST /api/users`) — *Pourquoi* : toute la logique de doublon, transaction et audit existe déjà
  dans cette route ; dupliquer reviendrait à réécrire `admitToChurch` en parallèle, contraire à la
  constitution (pas de sur-ingénierie). L'écran change, pas la route.
- **Écarté** : ajouter un champ `activatedAt`/`status` sur `User` — *Raison* : `accounts` porte
  déjà exactement cette information (compte lié à un provider OAuth) ; un champ dupliqué
  introduirait un état à synchroniser sans bénéfice (et une migration évitable).
- **Écarté** : détection/notification automatique d'un e-mail divergent à la connexion — *Raison* :
  tranché hors périmètre par la spec (questions ouvertes) ; le badge « jamais connecté » suffit à
  l'Admin pour s'en apercevoir lui-même.
- **Écarté** : purge automatique par délai — *Raison* : tranchée hors périmètre par la spec ;
  suppression manuelle uniquement, via la nouvelle action de suppression conditionnelle.
- **Choix** : suppression **conditionnelle** (`accounts.length === 0` uniquement) plutôt qu'une
  suppression libre de tout `User` — *Pourquoi* : évite qu'une suppression accidentelle efface un
  compte réellement actif ; aligné sur le critère d'acceptation « retirer un compte préparé jamais
  activé », pas « supprimer un utilisateur » en général (hors périmètre).

## Risques & points d'attention

- **Cross-église** : un `User` déjà actif dans une autre église ne doit jamais être supprimable
  depuis cette église — la garde vérifie l'absence de `churchRoles` dans **toute** église, pas
  seulement `churchId` courant.
- **Recherche de membres sans compte** (`/admin/users/new`) : filtrer côté page `memberUserLink:
  null` pour l'église courante — un membre déjà lié dans une autre église reste éligible ici (une
  fiche STAR est propre à une église, spec 037 inchangée).
- **Rétrocompatibilité de `POST /api/member-user-links`** : `memberId` seul reste valide (aucun
  changement pour l'écran `MembersClient` existant) ; seule l'union Zod change.
- **Mobile** : formulaire `/admin/users/new` à vérifier en largeur réduite (deux onglets
  lien/création + champs département) — cohérence avec le reste de `/admin`.

## Stratégie de tests

- `src/app/api/member-user-links/__tests__/route.test.ts` : nouveaux cas — création avec
  `newMember` (succès, département hors église → 400), `memberId` et `newMember` fournis ensemble
  → 400, ni l'un ni l'autre → 400.
- `src/app/api/users/__tests__/route.test.ts` : `neverConnected` à `true` sans `Account`, à
  `false` dès qu'une ligne `Account` existe.
- `src/app/api/users/[userId]/__tests__/route.test.ts` (nouveau) : suppression refusée si
  `accounts.length > 0` (409), refusée si rôle dans une autre église (409), acceptée sinon (200) +
  audit log.
- Pas de test E2E navigateur (hors outillage du projet) ; vérification manuelle du formulaire en
  recette (critère d'acceptation mobile).
