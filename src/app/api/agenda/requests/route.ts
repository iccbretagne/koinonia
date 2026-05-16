import { prisma } from "@/lib/prisma";
import { requireAuth, requireChurchPermission } from "@/lib/auth";
import { isProtocoleMember } from "@/modules/agenda/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { rolePermissions } from "@/lib/registry";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { sendEmail, buildAppointmentConfirmationEmail } from "@/lib/email";
import { z } from "zod";

const submitSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").nullable().optional(),
  phone: z.string().nullable().optional(),
  subject: z.string().min(1, "L'objet est requis"),
  message: z.string().min(1, "Le message est requis"),
  preferredDays: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const statusRaw = searchParams.get("status");
    if (!churchId) throw new ApiError(400, "churchId requis");

    // Valider l'enum avant toute logique d'autorisation
    const ALLOWED_STATUSES = ["PENDING", "VALIDATED"] as const;
    if (statusRaw !== null && !(ALLOWED_STATUSES as readonly string[]).includes(statusRaw)) {
      throw new ApiError(400, `Statut invalide. Valeurs acceptées : ${ALLOWED_STATUSES.join(", ")}`);
    }
    const statusParam = statusRaw as (typeof ALLOWED_STATUSES)[number] | null;

    const session = await requireAuth();

    const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
    if (!session.user.isSuperAdmin && roles.length === 0) throw new Error("FORBIDDEN");

    const userPerms = new Set(
      session.user.isSuperAdmin
        ? ["agenda:qualify", "agenda:manage"]
        : roles.flatMap((r) => rolePermissions[r.role] ?? [])
    );

    const canQualify = session.user.isSuperAdmin || userPerms.has("agenda:qualify");
    const canManage =
      session.user.isSuperAdmin ||
      userPerms.has("agenda:manage") ||
      (await isProtocoleMember(session, churchId));

    if (!canQualify && !canManage) throw new Error("FORBIDDEN");

    // Matrice stricte : chaque statut n'est accessible qu'au rôle autorisé
    if (statusParam === "PENDING" && !canQualify) throw new Error("FORBIDDEN");
    if (statusParam === "VALIDATED" && !canManage) throw new Error("FORBIDDEN");

    const statuses: Array<"PENDING" | "VALIDATED"> = statusParam
      ? [statusParam]
      : [...(canQualify ? (["PENDING"] as const) : []), ...(canManage ? (["VALIDATED"] as const) : [])];

    const requests = await prisma.appointmentRequest.findMany({
      where: { churchId, status: { in: statuses } },
      include: {
        user: { select: { id: true, name: true, displayName: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
        qualifiedBy: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(requests);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = submitSchema.parse(body);

    const session = await requireChurchPermission("planning:view", data.churchId);
    requireRateLimit(request, { prefix: `mut:${session.user.id}`, ...RATE_LIMIT_MUTATION });

    const [req, church] = await Promise.all([
      prisma.appointmentRequest.create({
        data: {
          churchId: data.churchId,
          userId: session.user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          subject: data.subject,
          message: data.message,
          preferredDays: data.preferredDays ?? null,
        },
      }),
      prisma.church.findUnique({ where: { id: data.churchId }, select: { name: true } }),
    ]);

    await logAudit({
      userId: session.user.id,
      churchId: data.churchId,
      action: "CREATE",
      entityType: "AppointmentRequest",
      entityId: req.id,
      details: { subject: data.subject },
    });

    if (data.email && church) {
      const { subject: emailSubject, html } = buildAppointmentConfirmationEmail({
        firstName: data.firstName,
        lastName: data.lastName,
        subject: data.subject,
        churchName: church.name,
      });
      sendEmail({ to: data.email, subject: emailSubject, html }).catch((err) => {
        console.error("[agenda/requests] sendEmail failed:", err?.message ?? err);
      });
    }

    return successResponse(req, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
