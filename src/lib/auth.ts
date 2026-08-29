import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma/client";

/**
 * Le mode de connexion développement (choix d'un compte de test généré par
 * `npm run db:seed:dev`, sans mot de passe ni service externe — voir
 * `POST /api/auth/dev-login`) n'est actif que si les DEUX conditions suivantes
 * sont réunies : `AUTH_DEV_LOGIN=true` ET `NODE_ENV` différent de `"production"`.
 * Double garde volontaire — même si `AUTH_DEV_LOGIN` fuitait dans une configuration
 * de production, `NODE_ENV=production` (toujours positionné par le build/déploiement,
 * voir docs/production.md) bloque quand même son activation.
 *
 * Ce mode n'est PAS un provider NextAuth : un provider Credentials force une session
 * JWT, incompatible avec la stratégie de session "database" utilisée ici pour Google
 * (voir plan.md, section Décisions). La route `dev-login` crée directement une ligne
 * `Session` via Prisma, exactement comme le ferait l'adapter pour une connexion Google —
 * le provider Google et la stratégie de session restent donc strictement inchangés.
 */
export function isDevLoginEnabled(env: { AUTH_DEV_LOGIN?: string; NODE_ENV?: string }) {
  return env.AUTH_DEV_LOGIN === "true" && env.NODE_ENV !== "production";
}

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Vérifie si un email est dans la liste SUPER_ADMIN_EMAILS (var d'env).
 *
 * USAGE RESTREINT : uniquement dans les callbacks NextAuth (signIn + session fallback).
 * Ne pas utiliser pour des contrôles d'accès API — utiliser session.user.isSuperAdmin (DB-backed).
 */
function isBootstrapSuperAdminEmail(email: string): boolean {
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
      pastoralProfileId: string | null;
      pastoralChurchIds: string[];
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

export const SESSION_COOKIE_NAME = "authjs.session-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Nécessaire derrière un reverse proxy (Traefik, nginx) pour que l'URL de
  // callback OAuth soit construite à partir du Host header et non de l'URL
  // interne — sans ça, la validation PKCE/nonce peut échouer avec une erreur
  // "unexpected iss" sur le callback Google.
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email || !user.id) return true;

      if (isBootstrapSuperAdminEmail(user.email)) {
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
      session.user.isSuperAdmin = dbUser?.isSuperAdmin || isBootstrapSuperAdminEmail(user.email ?? "");
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

      // For STAR roles, load departments from the member link
      const starDeptMap = new Map<string, { id: string; name: string }[]>();
      for (const cr of churchRoles) {
        if (cr.role === "STAR") {
          const link = await prisma.memberUserLink.findUnique({
            where: { userId_churchId: { userId: user.id, churchId: cr.churchId } },
            include: {
              member: {
                include: {
                  departments: {
                    include: { department: { select: { id: true, name: true } } },
                  },
                },
              },
            },
          });
          if (link) {
            starDeptMap.set(cr.id, link.member.departments.map((d) => d.department));
          }
        }
      }

      // Détection des profils pastoraux (multi-église) : par userId, puis par email (auto-liaison)
      const pastoralProfiles = await prisma.pastoralProfile.findMany({
        where: { userId: user.id },
        select: { id: true, churchId: true },
      });
      if (user.email) {
        const unlinkedByEmail = await prisma.pastoralProfile.findMany({
          where: { email: user.email, userId: null },
          select: { id: true, churchId: true },
        });
        if (unlinkedByEmail.length > 0) {
          await prisma.pastoralProfile.updateMany({
            where: { id: { in: unlinkedByEmail.map((p) => p.id) } },
            data: { userId: user.id },
          });
          const existingIds = new Set(pastoralProfiles.map((p) => p.id));
          for (const p of unlinkedByEmail) {
            if (!existingIds.has(p.id)) pastoralProfiles.push(p);
          }
        }
      }
      // Inclure également les églises supervisées par les profils de cet utilisateur
      const profileIds = pastoralProfiles.map((p) => p.id);
      const supervisedChurchIds = profileIds.length > 0
        ? (await prisma.church.findMany({
            where: { supervisorProfileId: { in: profileIds } },
            select: { id: true },
          })).map((c) => c.id)
        : [];
      const directChurchIds = new Set(pastoralProfiles.map((p) => p.churchId));
      const allPastoralChurchIds = [
        ...directChurchIds,
        ...supervisedChurchIds.filter((id) => !directChurchIds.has(id)),
      ];

      session.user.pastoralProfileId = pastoralProfiles[0]?.id ?? null;
      session.user.pastoralChurchIds = allPastoralChurchIds;

      session.user.churchRoles = churchRoles.map((cr) => {
        const extraDepts = ministerDeptMap.get(cr.id) ?? starDeptMap.get(cr.id);
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

  // Un profil pastoral dans cette église a une vue globale (lecture seule)
  if ((session.user.pastoralChurchIds ?? []).includes(churchId)) return { scoped: false };

  // DISCIPLE_MAKER : résoudre le membre lié au compte
  const link = await prisma.memberUserLink.findUnique({
    where: { userId_churchId: { userId: session.user.id, churchId } },
    select: { memberId: true },
  });
  return { scoped: true, memberId: link?.memberId ?? null };
}

export function getUserDepartmentScope(session: Session, churchId: string): DepartmentScope {
  if (session.user.isSuperAdmin) return { scoped: false };

  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role)
  );

  if (hasGlobalRole) {
    return { scoped: false };
  }

  const departmentIds = Array.from(
    new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId)
        .flatMap((r) => r.departments.map((d) => d.department.id))
    )
  );

  return { scoped: true, departmentIds };
}

/**
 * Jette FORBIDDEN si le département visé n'est pas dans le périmètre de l'appelant.
 * Un périmètre restreint et VIDE (aucun `user_departments`, cas du STAR) refuse tout —
 * c'est ce qui applique la restriction totale du STAR sans code spécifique à ce rôle
 * (spec 031).
 */
export function requireDepartmentAccess(
  session: Session,
  churchId: string,
  departmentId: string
): void {
  const scope = getUserDepartmentScope(session, churchId);
  if (scope.scoped && !scope.departmentIds.includes(departmentId)) {
    throw new Error("FORBIDDEN");
  }
}

type MinistryScope =
  | { scoped: false }
  | { scoped: true; ministryIds: string[] };

/**
 * Retourne la portée ministère de l'utilisateur connecté pour une église donnée.
 * - SUPER_ADMIN / ADMIN / SECRETARY → non scoped : vue complète de l'église
 * - MINISTER → scoped sur le ou les ministères qui lui sont assignés dans cette église
 * - Tous les autres rôles → scoped, ministryIds vide (aucune gestion des accès)
 * Un MINISTER sans ministère assigné obtient une liste vide : il ne gère personne, le
 * doute tranche toujours en faveur de la restriction (spec 031).
 */
export function getUserMinistryScope(session: Session, churchId: string): MinistryScope {
  if (session.user.isSuperAdmin) return { scoped: false };

  const hasGlobalRole = session.user.churchRoles.some(
    (r) => r.churchId === churchId && GLOBAL_ROLES.includes(r.role)
  );
  if (hasGlobalRole) return { scoped: false };

  const ministryIds = Array.from(
    new Set(
      session.user.churchRoles
        .filter((r) => r.churchId === churchId && r.ministryId)
        .map((r) => r.ministryId as string)
    )
  );

  return { scoped: true, ministryIds };
}

/**
 * Vérifie qu'un utilisateur possède une permission donnée **dans une église précise**.
 * Le churchId est obligatoire — voir requireCurrentChurchPermission pour le résoudre
 * depuis le contexte courant.
 */
// Permissions accordées aux utilisateurs ayant un profil pastoral dans une église
// (lire mais pas écrire)
const PASTORAL_READ_PERMISSIONS = new Set([
  "events:view",
  "discipleship:view",
  "planning:view",
  "members:view", // accès en lecture aux membres + section "Mes demandes"
  "accounting:stats",
]);

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
    // Pas de rôle dans cette église — vérifier si un profil pastoral donne accès
    if (
      PASTORAL_READ_PERMISSIONS.has(permission) &&
      (session.user.pastoralChurchIds ?? []).includes(churchId)
    ) {
      return session;
    }
    throw new Error("FORBIDDEN");
  }

  const { rolePermissions } = await import("./registry");
  const userPermissions = new Set(
    roles.flatMap((r) => rolePermissions[r.role] ?? [])
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

  const hasRoleAccess = session.user.churchRoles.some(
    (r) => r.churchId === churchId
  );
  // Un profil pastoral donne aussi accès à la zone admin (les pages individuelles
  // restent protégées par requireChurchPermission)
  const hasPastoralAccess = (session.user.pastoralChurchIds ?? []).includes(churchId);

  if (!hasRoleAccess && !hasPastoralAccess) {
    throw new Error("FORBIDDEN");
  }

  return session;
}

/**
 * Résout le churchId d'une ressource à partir de son type et de son identifiant.
 * Lève une ApiError 404 si la ressource n'existe pas.
 */
export async function resolveChurchId(
  resourceType: "event" | "department" | "member" | "request" | "memberLinkRequest" | "announcement" | "ministry" | "mediaEvent" | "mediaProject" | "appointmentRequest" | "agendaEntry" | "pastoralProfile",
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
    case "mediaEvent": {
      const me = await prisma.mediaEvent.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!me) throw new ApiError(404, "Événement média introuvable");
      return me.churchId;
    }
    case "mediaProject": {
      const mp = await prisma.mediaProject.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!mp) throw new ApiError(404, "Projet média introuvable");
      return mp.churchId;
    }
    case "appointmentRequest": {
      const ar = await prisma.appointmentRequest.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!ar) throw new ApiError(404, "Demande de RDV introuvable");
      return ar.churchId;
    }
    case "agendaEntry": {
      const ae = await prisma.agendaEntry.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!ae) throw new ApiError(404, "Entrée agenda introuvable");
      return ae.churchId;
    }
    case "pastoralProfile": {
      const pp = await prisma.pastoralProfile.findUnique({
        where: { id: resourceId },
        select: { churchId: true },
      });
      if (!pp) throw new ApiError(404, "Profil pastoral introuvable");
      return pp.churchId;
    }
  }
}

// ── Media access helpers ──────────────────────────────────────────────────────

/**
 * Vérifie si l'utilisateur est membre d'un département PRODUCTION_MEDIA dans l'église donnée.
 * Droits complets : vue, upload, gestion des tokens et suppression.
 */
export async function isProductionMediaMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: { function: "PRODUCTION_MEDIA", ministry: { churchId }, id: { in: userDeptIds } },
  });
  return count > 0;
}

/**
 * Vérifie si l'utilisateur est membre d'un département COMMUNICATION dans l'église donnée.
 * Droits limités : vue uniquement (pas d'upload ni de gestion).
 */
export async function isCommunicationMember(session: Session, churchId: string): Promise<boolean> {
  const userDeptIds = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments.map((d) => d.department.id));
  if (userDeptIds.length === 0) return false;
  const count = await prisma.department.count({
    where: { function: "COMMUNICATION", ministry: { churchId }, id: { in: userDeptIds } },
  });
  return count > 0;
}

/**
 * Autorise l'accès en lecture aux ressources média.
 * Passe si : permission `media:view` (ADMIN, SECRETARY…)
 *         OU membre PRODUCTION_MEDIA (droits complets)
 *         OU membre COMMUNICATION (vue uniquement).
 */
export async function requireMediaAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("media:view") || await isProductionMediaMember(session, churchId) || await isCommunicationMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise l'upload et la création de ressources média.
 * Passe si : permission `media:upload` (ADMIN, SECRETARY…)
 *         OU membre PRODUCTION_MEDIA
 *         OU membre COMMUNICATION.
 */
export async function requireMediaUploadAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("media:upload") || await isProductionMediaMember(session, churchId) || await isCommunicationMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise la gestion des ressources média (liens de partage, tokens sensibles…).
 * Passe si : permission `media:manage` (ADMIN…) OU membre PRODUCTION_MEDIA.
 * La team Communication n'a pas ce droit.
 */
export async function requireMediaManageAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("media:manage") || await isProductionMediaMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

/**
 * Passe si : permission `media:review` (ADMIN…) OU membre PRODUCTION_MEDIA.
 * La team Communication n'a pas ce droit.
 */
export async function requireMediaReviewAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));

  if (userPerms.has("media:review") || await isProductionMediaMember(session, churchId))
    return session;

  throw new Error("FORBIDDEN");
}

// ── Audio access helpers ──────────────────────────────────────────────────────

/**
 * Autorise l'accès aux ressources du module audio (vue, dépôt, révision).
 * Passe si : la permission de rôle donnée (`audio:view`/`audio:upload`/`audio:review`,
 * ADMIN/SECRETARY…) OU appartenance au département de captation configuré
 * (`AudioSettings.captureDepartmentId`), quel que soit le rôle — autonomie complète
 * dépôt → publication pour l'équipe technique (D7).
 */
export async function requireAudioAccess(permission: string, churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  if (userPerms.has(permission)) return session;

  const { isCaptureTeamMember } = await import("@/modules/audio");
  const departmentIds = roles.flatMap((r) => r.departments.map((d) => d.department.id));
  if (await isCaptureTeamMember(churchId, departmentIds)) return session;

  throw new Error("FORBIDDEN");
}

/**
 * Autorise la dépublication d'un culte audio — geste plus lourd que publier (un lien déjà
 * partagé devient inopérant). Passe si : `audio:manage` (ADMIN/SECRETARY…) OU
 * responsable (`DEPARTMENT_HEAD`/`MINISTER`) du département de captation configuré.
 */
export async function requireAudioUnpublishAccess(churchId: string) {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) return session;

  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) throw new Error("FORBIDDEN");

  const { rolePermissions } = await import("./registry");
  const userPerms = new Set(roles.flatMap((r) => rolePermissions[r.role] ?? []));
  if (userPerms.has("audio:manage")) return session;

  const { isCaptureTeamLead } = await import("@/modules/audio");
  if (await isCaptureTeamLead(session, churchId)) return session;

  throw new Error("FORBIDDEN");
}

// Contexte d'AFFICHAGE, jamais une autorisation : la valeur peut provenir d'un cookie
// posé par le client. Elle ne fait que sélectionner, parmi les églises où la session a
// un rattachement (rôle ou supervision pastorale), laquelle regarder — elle ne confère
// aucun droit par elle-même. Toute décision d'autorisation doit vérifier la permission
// DANS l'église ainsi désignée (cf. requireCurrentChurchPermission), jamais s'y fier seule.
export async function getCurrentChurchId(
  session: Session
): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const preferred = cookieStore.get("current-church")?.value;
  const pastoralChurchIds = session.user.pastoralChurchIds ?? [];

  if (preferred) {
    const hasRoleAccess = session.user.churchRoles.some((r) => r.churchId === preferred);
    if (hasRoleAccess) return preferred;
    // Accepter aussi une église pastorale/supervisée comme contexte courant
    if (pastoralChurchIds.includes(preferred)) return preferred;
  }

  return session.user.churchRoles[0]?.churchId ?? pastoralChurchIds[0];
}

/**
 * Vérifie une permission dans l'église courante (cf. getCurrentChurchId) et la retourne.
 * Remplaçant de l'ancien `requirePermission(permission)` sans église : résout le contexte
 * PUIS vérifie la permission dans ce contexte — jamais l'inverse — pour qu'un `churchId`
 * ne puisse être retourné sans que la permission y ait été vérifiée.
 */
export async function requireCurrentChurchPermission(permission: string) {
  const session = await requireAuth();
  const { ApiError } = await import("./api-utils");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");
  await requireChurchPermission(permission, churchId);
  return { session, churchId };
}

/**
 * Réserve une action à l'administration de la plateforme (permissions globales telles que
 * `church:manage`) : jamais évaluée dans une église, toujours globale — le Super Admin
 * uniquement aujourd'hui, cf. `src/modules/core/index.ts`.
 */
export async function requireSuperAdmin() {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/**
 * Permissions volontairement transverses, non rattachées à une église : les modèles
 * concernés (module emploi) n'ont pas de `churchId` par conception. Liste blanche
 * explicite pour que toute portée globale reste énumérable et justifiée en revue —
 * ne pas y ajouter une permission qui devrait être vérifiée par église.
 */
const PLATFORM_PERMISSIONS = new Set([
  "jobs:seek",
  "jobs:post",
  "jobs:freelance",
]);

export async function requirePlatformPermission(permission: string) {
  if (!PLATFORM_PERMISSIONS.has(permission)) {
    throw new Error(
      `Permission "${permission}" non déclarée comme transverse — vérifier par église via requireCurrentChurchPermission.`
    );
  }
  const session = await requireAuth();

  if (session.user.isSuperAdmin) return session;

  const { rolePermissions } = await import("./registry");
  const userPermissions = new Set(
    session.user.churchRoles.flatMap((r) => rolePermissions[r.role] ?? [])
  );
  if (!userPermissions.has(permission)) {
    throw new Error("FORBIDDEN");
  }

  return session;
}
