import { prisma } from "@/lib/prisma";
import { auth, requireChurchPermission, getUserMinistryScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
import { notifyUsers } from "@/lib/notifications";
import { z } from "zod";

const roleSchema = z
  .enum(["DEPARTMENT_HEAD", "DEPUTY", "MINISTER", "DISCIPLE_MAKER", "REPORTER"])
  .nullable()
  .optional();

const createSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("existing"),
    memberId: z.string().min(1),
    churchId: z.string().min(1),
    departmentId: z.string().optional(),
    ministryId: z.string().optional(),
    requestedRole: roleSchema,
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("new"),
    firstName: z.string().min(1, "Le prénom est requis"),
    lastName: z.string().min(1, "Le nom est requis"),
    phone: z.string().optional(),
    churchId: z.string().min(1, "L'église est requise"),
    departmentId: z.string().optional(),
    ministryId: z.string().optional(),
    requestedRole: roleSchema,
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    type: z.literal("no_star"),
    churchId: z.string().min(1, "L'église est requise"),
    requestedRole: z.enum(["DISCIPLE_MAKER", "REPORTER"]),
    notes: z.string().max(1000).optional(),
  }),
]);

type CreateInput = z.infer<typeof createSchema>;

/** Une seule demande en attente, et aucun lien déjà établi, par compte et par église. */
async function assertCanRequest(userId: string, churchId: string) {
  const existing = await prisma.memberLinkRequest.findFirst({
    where: { userId, churchId, status: "PENDING" },
  });
  if (existing) {
    throw new ApiError(409, "Une demande est déjà en attente pour votre compte dans cette église");
  }
  const existingLink = await prisma.memberUserLink.findFirst({ where: { userId, churchId } });
  if (existingLink) {
    throw new ApiError(409, "Votre compte est déjà lié à un STAR dans cette église");
  }
}

/** STAR existant : introuvable, déjà lié ou d'une autre église sont refusés. */
async function assertLinkableMember(memberId: string, churchId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      userLinks: { where: { churchId } },
      departments: {
        where: { isPrimary: true },
        include: { department: { include: { ministry: { select: { churchId: true } } } } },
      },
    },
  });
  if (!member) throw new ApiError(404, "STAR introuvable");
  if (member.userLinks.length > 0) throw new ApiError(409, "Ce STAR est déjà lié à un compte dans cette église");

  const primaryChurchId = member.departments[0]?.department.ministry.churchId;
  if (primaryChurchId !== churchId) {
    throw new ApiError(400, "Ce STAR n'appartient pas à cette église");
  }
}

/** Champs propres au type de demande : rien, le STAR visé, ou l'identité du nouveau STAR. */
async function typeFields(data: CreateInput) {
  if (data.type === "no_star") return {};
  if (data.type === "existing") {
    await assertLinkableMember(data.memberId, data.churchId);
    return { memberId: data.memberId };
  }
  return { firstName: data.firstName, lastName: data.lastName, phone: data.phone ?? undefined };
}

/** Prévient l'administration et le secrétariat de l'église. */
async function notifyChurchAdmins(churchId: string, requesterName: string | null | undefined) {
  const adminRoles = await prisma.userChurchRole.findMany({
    where: {
      churchId,
      role: { in: ["SUPER_ADMIN", "ADMIN", "SECRETARY"] },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  if (adminRoles.length === 0) return;
  await notifyUsers(
    adminRoles.map((r) => r.userId),
    {
      domain: "account",
      type: "MEMBER_LINK_REQUEST",
      title: "Nouvelle demande de liaison",
      message: `${requesterName} a soumis une demande de liaison compte STAR.`,
      link: "/admin/access",
    }
  );
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) throw new ApiError(401, "Non authentifié");
    requireRateLimit(request, { prefix: `linkreq:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const body = await request.json();
    const data = createSchema.parse(body);

    await assertCanRequest(session.user.id, data.churchId);

    const commonFields = {
      userId: session.user.id,
      churchId: data.churchId,
      requestedRole: data.requestedRole ?? null,
      notes: data.notes ?? undefined,
      departmentId: ("departmentId" in data ? data.departmentId : undefined) ?? undefined,
      ministryId: ("ministryId" in data ? data.ministryId : undefined) ?? undefined,
    };

    const req = await prisma.memberLinkRequest.create({
      data: { ...commonFields, ...(await typeFields(data)) },
    });

    // Notify all admins/secretaries in the church about the new link request
    await notifyChurchAdmins(
      data.churchId,
      session.user.displayName || session.user.name || session.user.email
    );

    return successResponse(req, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const status = searchParams.get("status") ?? "PENDING";

    if (!churchId) throw new ApiError(400, "churchId requis");
    // access:manage (Super Admin, Admin, Secrétaire, Ministre borné à son ministère) — remplace
    // members:manage, qui donnait accès à toutes les demandes de l'église à tout Resp.
    // département quel que soit son département (spec 054/#583, défaut B4 de audit-rbac.md)
    const session = await requireChurchPermission("access:manage", churchId);
    const ministryScope = getUserMinistryScope(session, churchId);

    const requests = await prisma.memberLinkRequest.findMany({
      where: {
        churchId,
        status: status as "PENDING" | "APPROVED" | "REJECTED",
        ...(ministryScope.scoped
          ? {
              OR: [
                { ministryId: { in: ministryScope.ministryIds } },
                { department: { ministryId: { in: ministryScope.ministryIds } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departments: {
              where: { isPrimary: true },
              select: {
                department: {
                  select: { name: true, ministry: { select: { name: true } } },
                },
              },
            },
          },
        },
        department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } },
        ministry: { select: { id: true, name: true } },
        church: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}
