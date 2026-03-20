import { prisma } from "@/lib/prisma";
import { auth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { z } from "zod";

const createSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("existing"),
    memberId: z.string().min(1),
    churchId: z.string().min(1),
  }),
  z.object({
    type: z.literal("new"),
    firstName: z.string().min(1, "Le prénom est requis"),
    lastName: z.string().min(1, "Le nom est requis"),
    phone: z.string().optional(),
    churchId: z.string().min(1, "L'église est requise"),
  }),
]);

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) throw new ApiError(401, "Non authentifié");

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

    if (data.type === "existing") {
      // Vérifier que le Member existe et n'est pas déjà lié
      const member = await prisma.member.findUnique({
        where: { id: data.memberId },
        include: { userLink: true },
      });
      if (!member) throw new ApiError(404, "STAR introuvable");
      if (member.userLink) throw new ApiError(409, "Ce STAR est déjà lié à un compte");

      const req = await prisma.memberLinkRequest.create({
        data: {
          userId: session.user.id,
          memberId: data.memberId,
          churchId: data.churchId,
        },
      });
      return successResponse(req, 201);
    } else {
      const req = await prisma.memberLinkRequest.create({
        data: {
          userId: session.user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          churchId: data.churchId,
        },
      });
      return successResponse(req, 201);
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await requirePermission("members:manage");
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const status = searchParams.get("status") ?? "PENDING";

    const requests = await prisma.memberLinkRequest.findMany({
      where: {
        ...(churchId ? { churchId } : {}),
        status: status as "PENDING" | "APPROVED" | "REJECTED",
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        member: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true, ministry: { select: { name: true } } } } } },
        church: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}
