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

**Middleware** (`src/middleware.ts`) :
- Protege `/dashboard/*` et `/api/*` (sauf `/api/auth/*`)
- Verifie l'existence d'une session NextAuth valide
- Redirige vers `/` si non authentifie

**Helpers** (`src/lib/auth.ts`) :
- `requireAuth()` — verifie la session et throw `UNAUTHORIZED` si absente
- `requirePermission(permission, churchId?)` — verifie une permission specifique et throw `FORBIDDEN` si non autorise
- `requireAnyPermission(...permissions)` — verifie au moins une permission parmi la liste (utilise par le layout admin)
- `getUserDepartmentScope(session)` — retourne le perimetre departements selon le role

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

Un utilisateur peut avoir **plusieurs roles** dans **plusieurs eglises** via la table `user_church_roles`.

### Attribution

- **Super Admin** : automatique a la premiere connexion si l'email est dans `SUPER_ADMIN_EMAILS`
- **Autres roles** : via l'interface admin (`/admin/users`), avec affectation optionnelle de ministere (MINISTER) ou departements (DEPARTMENT_HEAD)

---

## Permissions

Matrice role-permissions definie dans `src/lib/permissions.ts` :

| Permission | Super Admin | Admin | Secrétaire | Ministre | Resp. département |
|---|---|---|---|---|---|
| `planning:view` | x | x | x | x | x |
| `planning:edit` | x | x | | x | x |
| `members:view` | x | x | x | x | x |
| `members:manage` | x | x | | x | x |
| `events:view` | x | x | x | x | x |
| `events:manage` | x | x | x | | |
| `departments:view` | x | x | x | x | x |
| `departments:manage` | x | x | | | |
| `church:manage` | x | | | | |
| `users:manage` | x | | | | |

**Spécificités du Secrétaire** :
- Voit tous les départements de son église (même périmètre que Admin)
- Planning en lecture seule (pas de `planning:edit`)
- Membres en lecture seule dans l'admin (pas de `members:manage`)
- Peut gérer les événements (`events:manage`)

### Utilisation dans le code

```typescript
// Dans un route handler
import { requirePermission } from "@/lib/auth";

export async function DELETE(request, { params }) {
  try {
    const session = await requirePermission("members:manage", churchId);
    // ... logique
  } catch (error) {
    return errorResponse(error); // 401 ou 403 automatique
  }
}
```

### Cas particulier : PATCH departments/[id] (function)

L'endpoint `PATCH /api/departments/[departmentId]` qui assigne une `DepartmentFunction` est protege par `events:manage` (et non `departments:manage`). Ce choix reflète le fait que la configuration des fonctions departementales est liee au workflow des annonces et evenements, non a la gestion structurelle des departements.

### Visibilite des departements

- **Super Admin / Admin / Secrétaire** : voient tous les départements de leur église (lecture globale)
- **Ministre** : voit les départements du ministère qui lui est assigné
- **Responsable de département** : voit uniquement les départements qui lui sont assignés via `user_departments`

Cette logique est implémentée dans `src/app/(auth)/layout.tsx` et `getUserDepartmentScope()` dans `src/lib/auth.ts`.
