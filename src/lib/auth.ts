import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma/client";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      displayName: string | null;
      image: string | null;
      isSuperAdmin: boolean;
      hasSeenTour: boolean;
      churchRoles: {
        id: string;
        churchId: string;
        role: Role;
        ministryId: string | null;
        church: { id: string; name: string; slug: string };
        departments: {
          department: { id: string; name: string };
        }[];
      }[];
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email || !user.id) return true;

      if (isSuperAdmin(user.email)) {
        // On first-ever sign-in the User row may not exist yet (PrismaAdapter
        // creates it after the signIn callback returns). We wrap everything in
        // a try-catch so sign-in isn't blocked. The session callback falls back
        // to the email check for isSuperAdmin, and these DB writes will succeed
        // on the next sign-in.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { isSuperAdmin: true },
          });

          const churches = await prisma.church.findMany();
          for (const church of churches) {
            await prisma.userChurchRole.upsert({
              where: {
                userId_churchId_role: {
                  userId: user.id,
                  churchId: church.id,
                  role: "SUPER_ADMIN",
                },
              },
              update: {},
              create: {
                userId: user.id,
                churchId: church.id,
                role: "SUPER_ADMIN",
              },
            });
          }
        } catch {
          // User not yet created by adapter — skip, will be set on next login
        }
      }

      return true;
    },
    // OAuth tokens (access_token, refresh_token) are stored by PrismaAdapter in
    // the accounts table but are intentionally never exposed here — we only use
    // Google for authentication, not for API access.
    async session({ session, user }) {
      session.user.id = user.id;

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { displayName: true, isSuperAdmin: true, hasSeenTour: true },
      });
      session.user.displayName = dbUser?.displayName ?? null;
      session.user.isSuperAdmin = dbUser?.isSuperAdmin || isSuperAdmin(user.email ?? "");
      session.user.hasSeenTour = dbUser?.hasSeenTour ?? false;

      const churchRoles = await prisma.userChurchRole.findMany({
        where: { userId: user.id },
        include: {
          church: { select: { id: true, name: true, slug: true } },
          ministry: { select: { id: true } },
          departments: {
            include: {
              department: { select: { id: true, name: true } },
            },
          },
        },
      });

      // For MINISTER roles with a ministryId, load all departments of the ministry
      const ministerDeptMap = new Map<string, { id: string; name: string }[]>();
      for (const cr of churchRoles) {
        if (cr.role === "MINISTER" && cr.ministryId) {
          const ministryDepts = await prisma.department.findMany({
            where: { ministryId: cr.ministryId },
            select: { id: true, name: true },
          });
          ministerDeptMap.set(cr.id, ministryDepts);
        }
      }

      session.user.churchRoles = churchRoles.map((cr) => {
        const extraDepts = ministerDeptMap.get(cr.id);
        const departments = cr.departments.map((d) => ({ department: d.department }));
        if (extraDepts) {
          const existingIds = new Set(departments.map((d) => d.department.id));
          for (const dept of extraDepts) {
            if (!existingIds.has(dept.id)) {
              departments.push({ department: dept });
            }
          }
        }
        return {
          ...cr,
          ministryId: cr.ministry?.id ?? null,
          departments,
        };
      });

      return session;
    },
  },
});

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requirePermission(permission: string, churchId?: string) {
  const session = await requireAuth();

  // Global super admin bypasses all permissions
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter(
    (r) => !churchId || r.churchId === churchId
  );

  const { hasPermission } = await import("./permissions");
  const userPermissions = new Set(
    roles.flatMap((r) => hasPermission(r.role))
  );

  if (!userPermissions.has(permission)) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

export async function requireAnyPermission(...permissions: string[]) {
  const session = await requireAuth();

  // Global super admin bypasses all permissions
  if (session.user.isSuperAdmin) return session;

  const { hasPermission } = await import("./permissions");
  const userPermissions = new Set(
    session.user.churchRoles.flatMap((r) => hasPermission(r.role))
  );

  if (!permissions.some((p) => userPermissions.has(p))) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

type DepartmentScope =
  | { scoped: false }
  | { scoped: true; departmentIds: string[] };

const GLOBAL_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "SECRETARY"];

export type DiscipleshipScope =
  | { scoped: false }
  | { scoped: true; memberId: string | null };

/**
 * Retourne la portée discipolat de l'utilisateur connecté pour une église donnée.
 * - SUPER_ADMIN / ADMIN / SECRETARY → non scoped : vue complète de l'église
 * - Tous les autres rôles (DISCIPLE_MAKER, MINISTER, DEPARTMENT_HEAD…) → scoped : ne voit que ses propres disciples
 */
export async function getDiscipleshipScope(
  session: Session,
  churchId: string
): Promise<DiscipleshipScope> {
  if (session.user.isSuperAdmin) return { scoped: false };

  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role as Role)
  );
  if (hasGlobalRole) return { scoped: false };

  // DISCIPLE_MAKER : résoudre le membre lié au compte
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  return { scoped: true, memberId: link?.memberId ?? null };
}

export function getUserDepartmentScope(session: Session): DepartmentScope {
  const hasGlobalRole = session.user.churchRoles.some((r) =>
    GLOBAL_ROLES.includes(r.role)
  );

  if (hasGlobalRole) {
    return { scoped: false };
  }

  const departmentIds = Array.from(
    new Set(
      session.user.churchRoles.flatMap((r) =>
        r.departments.map((d) => d.department.id)
      )
    )
  );

  return { scoped: true, departmentIds };
}

/**
 * Vérifie qu'un utilisateur possède une permission donnée **dans une église précise**.
 * Contrairement à requirePermission, le churchId est obligatoire.
 */
export async function requireChurchPermission(
  permission: string,
  churchId: string
) {
  const session = await requireAuth();

  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter(
    (r) => r.churchId === churchId
  );

  if (roles.length === 0) {
    throw new Error("FORBIDDEN");
  }

  const { hasPermission } = await import("./permissions");
  const userPermissions = new Set(
    roles.flatMap((r) => hasPermission(r.role))
  );

  if (!userPermissions.has(permission)) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

/**
 * Vérifie que l'utilisateur a au moins un rôle dans l'église donnée (sans vérifier de permission précise).
 */
export async function requireChurchAccess(churchId: string) {
  const session = await requireAuth();

  if (session.user.isSuperAdmin) return session;

  const hasAccess = session.user.churchRoles.some(
    (r) => r.churchId === churchId
  );

  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

/**
 * Résout le churchId d'une ressource à partir de son type et de son identifiant.
 * Lève une ApiError 404 si la ressource n'existe pas.
 */
export async function resolveChurchId(
  resourceType: "event" | "department" | "member" | "request" | "memberLinkRequest" | "announcement" | "ministry",
  resourceId: string
): Promise<string> {
  const { ApiError } = await import("./api-utils");

  switch (resourceType) {
    case "event": {
      const event = await prisma.event.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!event) throw new ApiError(404, "Événement introuvable");
      return event.churchId;
    }
    case "department": {
      const dept = await prisma.department.findUnique({
        where: { id: resourceId },
        include: { ministry: { select: { churchId: true } } },
      });
      if (!dept) throw new ApiError(404, "Département introuvable");
      return dept.ministry.churchId;
    }
    case "member": {
      const member = await prisma.member.findUnique({
        where: { id: resourceId },
        include: {
          departments: {
            where: { isPrimary: true },
            include: { department: { include: { ministry: { select: { churchId: true } } } } },
          },
        },
      });
      if (!member) throw new ApiError(404, "Membre introuvable");
      const primary = member.departments[0];
      if (!primary) throw new ApiError(404, "Membre sans département principal");
      return primary.department.ministry.churchId;
    }
    case "request": {
      const req = await prisma.request.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!req) throw new ApiError(404, "Demande introuvable");
      return req.churchId;
    }
    case "memberLinkRequest": {
      const mlr = await prisma.memberLinkRequest.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!mlr) throw new ApiError(404, "Demande de liaison introuvable");
      return mlr.churchId;
    }
    case "announcement": {
      const ann = await prisma.announcement.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!ann) throw new ApiError(404, "Annonce introuvable");
      return ann.churchId;
    }
    case "ministry": {
      const ministry = await prisma.ministry.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!ministry) throw new ApiError(404, "Ministère introuvable");
      return ministry.churchId;
    }
  }
}

export async function getCurrentChurchId(
  session: Session
): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const preferred = cookieStore.get("current-church")?.value;

  if (preferred) {
    const hasAccess = session.user.churchRoles.some(
      (r) => r.churchId === preferred
    );
    if (hasAccess) return preferred;
  }

  return session.user.churchRoles[0]?.churchId;
}
