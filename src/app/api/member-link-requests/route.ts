import { prisma } from "@/lib/prisma";
import { auth, requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";
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

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) throw new ApiError(401, "Non authentifié");
    requireRateLimit(request, { prefix: `linkreq:${session.user.id}`, ...RATE_LIMIT_SENSITIVE });

    const body = await request.json();
    const data = createSchema.parse(body);

    // Vérifier qu'il n'y a pas déjà une demande PENDING pour cet utilisateur
    const existing = await prisma.memberLinkRequest.findFirst({
      where: { userId: session.user.id, status: "PENDING" },
    });
    if (existing) {
      throw new ApiError(409, "Une demande est déjà en attente pour votre compte");
    }

    // Vérifier qu'un lien n'existe pas déjà pour cet utilisateur dans cette église
    const existingLink = await prisma.memberUserLink.findFirst({
      where: { userId: session.user.id, churchId: data.churchId },
    });
    if (existingLink) {
      throw new ApiError(409, "Votre compte est déjà lié à un STAR dans cette église");
    }

    const commonFields = {
      userId: session.user.id,
      churchId: data.churchId,
      requestedRole: ("requestedRole" in data ? data.requestedRole : null) ?? null,
      notes: ("notes" in data ? data.notes : undefined) ?? undefined,
      departmentId: ("departmentId" in data ? data.departmentId : undefined) ?? undefined,
      ministryId: ("ministryId" in data ? data.ministryId : undefined) ?? undefined,
    };

    let req;

    if (data.type === "no_star") {
      req = await prisma.memberLinkRequest.create({ data: commonFields });
    } else if (data.type === "existing") {
      const member = await prisma.member.findUnique({
        where: { id: data.memberId },
        include: {
          userLink: true,
          departments: {
            where: { isPrimary: true },
            include: { department: { include: { ministry: { select: { churchId: true } } } } },
          },
        },
      });
      if (!member) throw new ApiError(404, "STAR introuvable");
      if (member.userLink) throw new ApiError(409, "Ce STAR est déjà lié à un compte");

      const primaryChurchId = member.departments[0]?.department.ministry.churchId;
      if (primaryChurchId !== data.churchId) {
        throw new ApiError(400, "Ce STAR n'appartient pas à cette église");
      }

      req = await prisma.memberLinkRequest.create({
        data: { ...commonFields, memberId: data.memberId },
      });
    } else {
      // type === "new"
      req = await prisma.memberLinkRequest.create({
        data: {
          ...commonFields,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? undefined,
        },
      });
    }

    // Notify all admins/secretaries in the church about the new link request
    const requesterName =
      session.user.displayName || session.user.name || session.user.email;
    const adminRoles = await prisma.userChurchRole.findMany({
      where: {
        churchId: data.churchId,
        role: { in: ["SUPER_ADMIN", "ADMIN", "SECRETARY"] },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (adminRoles.length > 0) {
      await prisma.notification.createMany({
        data: adminRoles.map((r) => ({
          userId: r.userId,
          type: "MEMBER_LINK_REQUEST",
          title: "Nouvelle demande de liaison",
          message: `${requesterName} a soumis une demande de liaison compte STAR.`,
          link: "/admin/access",
        })),
        skipDuplicates: true,
      });
    }

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
    await requireChurchPermission("members:manage", churchId);

    const requests = await prisma.memberLinkRequest.findMany({
      where: {
        churchId,
        status: status as "PENDING" | "APPROVED" | "REJECTED",
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
