import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

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
        // Set global flag
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
      }

      return true;
    },
    async session({ session, user }) {
      session.user.id = user.id;

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { displayName: true, isSuperAdmin: true },
      });
      session.user.displayName = dbUser?.displayName ?? null;
      session.user.isSuperAdmin = dbUser?.isSuperAdmin ?? false;

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
        let departments = cr.departments.map((d) => ({ department: d.department }));
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
