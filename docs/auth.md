# Authentification & roles

## Authentification

### Google OAuth via NextAuth v5

L'authentification utilise [NextAuth v5](https://authjs.dev/) (Auth.js) avec le provider Google.

**Flux** :
1. L'utilisateur clique "Se connecter avec Google" sur la page `/`
2. Redirection vers Google OAuth (`/api/auth/signin`)
3. Callback vers `/api/auth/callback/google`
4. NextAuth cree ou retrouve l'utilisateur en base (via PrismaAdapter)
5. Session creee, redirection vers `/dashboard`

**Premiere connexion** :
- L'utilisateur est cree automatiquement dans la table `users`
- Si son email est dans `SUPER_ADMIN_EMAILS`, il recoit automatiquement le role `SUPER_ADMIN` sur toutes les eglises existantes
- Sinon, il n'a aucun role (acces au dashboard mais pas de departements visibles)

### Session

La session NextAuth est enrichie dans le callback `session` avec :
- `user.id` — ID de l'utilisateur
- `user.churchRoles[]` — tous les roles de l'utilisateur avec les infos eglise et departements

```typescript
session.user.churchRoles = [
  {
    id: "clx...",
    churchId: "clx...",
    role: "ADMIN",
    church: { id: "clx...", name: "ICC Rennes", slug: "icc-rennes" },
    departments: [
      { department: { id: "clx...", name: "Choristes" } }
    ]
  }
]
```

### Protection des routes

**Middleware** (`src/proxy.ts`, ex `src/middleware.ts`) :
- Protege `/dashboard/*` et `/api/*` (sauf `/api/auth/*`)
- Verifie l'existence d'une session NextAuth valide
- Redirige vers `/` si non authentifie
- Exporte `proxy` (pas `middleware`), runtime Node.js (pas Edge)

**Helpers** (`src/lib/auth.ts`) :
- `requireAuth()` — verifie la session et throw `UNAUTHORIZED` si absente
- `requirePermission(permission, churchId?)` — verifie une permission, throw `FORBIDDEN` si non autorise
- `requireChurchPermission(permission, churchId)` — idem, churchId obligatoire
- `requireAnyPermission(...permissions)` — verifie au moins une permission parmi la liste
- `getUserDepartmentScope(session)` — retourne le perimetre departements selon le role
- `getDiscipleshipScope(session, churchId)` — portee discipolat (scoped ou non)
- `resolveChurchId(type, resourceId)` — retrouve le `churchId` d'une ressource
- `getCurrentChurchId(session)` — eglise active (cookie `current-church` ou premiere de la liste)

---

## Roles

### Hierarchie

| Role | Code Prisma | Perimetre |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Toutes les eglises |
| Admin eglise | `ADMIN` | Une eglise |
| Secretariat | `SECRETARY` | Une eglise |
| Ministre | `MINISTER` | Un ministere d'une eglise |
| Responsable departement | `DEPARTMENT_HEAD` | Un ou plusieurs departements |
| Accompagnateur discipolat | `DISCIPLE_MAKER` | Suivi des relations de discipolat et gestion des presences |
| Rapporteur | `REPORTER` | Acces en lecture/ecriture aux comptes rendus d'evenements |

Un utilisateur peut avoir **plusieurs roles** dans **plusieurs eglises** via la table `user_church_roles`.

### Attribution

- **Super Admin** : automatique a la premiere connexion si l'email est dans `SUPER_ADMIN_EMAILS`
- **Autres roles** : via l'interface admin (`/admin/users`), avec affectation optionnelle de ministere (MINISTER) ou departements (DEPARTMENT_HEAD)
- **isDeputy** : la table `user_departments` (liaison `DEPARTMENT_HEAD` ↔ departements) dispose d'un flag `isDeputy` pour distinguer le responsable principal du responsable adjoint (deputy)

---

## Permissions

La matrice role-permissions est **derivee dynamiquement** depuis les manifestes de modules (`src/modules/*/index.ts`) via `buildRolePermissions(registry)`. La source de verite est les blocs `permissions` de chaque manifeste, pas le fichier `src/lib/permissions.ts` (deprecated).

Le singleton `rolePermissions` (pre-calcule au demarrage dans `src/lib/registry.ts`) est utilise directement dans les routes API et composants :

```typescript
import { rolePermissions } from "@/lib/registry";

const userPermissions = new Set(
  session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
);
```

Matrice resultante :

| Permission | Super Admin | Admin | Secrétaire | Ministre | Resp. département | Disciple Maker | Reporter |
|---|---|---|---|---|---|---|---|
| `planning:view` | x | x | x | x | x | | |
| `planning:edit` | x | x | | x | x | | |
| `members:view` | x | x | x | x | x | | |
| `members:manage` | x | x | | x | x | | |
| `events:view` | x | x | x | x | x | | x |
| `events:manage` | x | x | x | | | | |
| `departments:view` | x | x | x | x | x | | |
| `departments:manage` | x | x | | | | | |
| `church:manage` | x | | | | | | |
| `users:manage` | x | | | | | | |
| `discipleship:view` | x | x | x | | x | x | |
| `discipleship:manage` | x | x | | | | x | |
| `discipleship:export` | x | | x | | | | |
| `reports:view` | x | x | x | | | | x |
| `reports:edit` | x | x | x | | | | x |

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`)
- Peut gérer les événements (`events:manage`)
- Peut exporter les données discipolat (`discipleship:export`)
- Accès en lecture/écriture aux comptes rendus (`reports:view` + `reports:edit`)

**Spécificités du Reporter** :
- Accès aux événements en lecture (`events:view`) et aux comptes rendus (`reports:view` + `reports:edit`)
- Pas d'accès au planning, aux membres, au discipolat ni à la section admin

### Utilisation dans le code

```typescript
// Dans un route handler (protection + permission)
import { requireChurchPermission } from "@/lib/auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireChurchPermission("members:manage", churchId);
    // ... logique
  } catch (error) {
    return errorResponse(error); // 401 ou 403 automatique
  }
}
```

```typescript
// Test de permission dans un composant serveur
import { rolePermissions } from "@/lib/registry";

const canManage = session.user.isSuperAdmin || session.user.churchRoles
  .filter((r) => r.churchId === churchId)
  .flatMap((r) => rolePermissions[r.role] ?? [])
  .includes("events:manage");
```

### Cas particulier : PATCH departments/[id] (function)

L'endpoint `PATCH /api/departments/[departmentId]` qui assigne une fonction departementale (String) est protege par `events:manage`. Ce choix reflète que la configuration des fonctions est liee au workflow des annonces et evenements, non a la gestion structurelle des departements.

### Visibilite des departements

- **Super Admin / Admin / Secrétaire** : voient tous les départements de leur église (lecture globale)
- **Ministre** : voit les départements du ministère qui lui est assigné
- **Responsable de département** : voit uniquement les départements qui lui sont assignés via `user_departments`
- **Disciple Maker** : pas d'accès au planning ni à la grille des départements ; périmètre limité au module discipolat
- **Reporter** : pas d'accès au planning, aux membres ni à la section admin ; voit uniquement les événements et les comptes rendus qui lui sont accessibles

Cette logique est implémentée dans `src/app/(auth)/layout.tsx` et `getUserDepartmentScope()` dans `src/lib/auth.ts`.
