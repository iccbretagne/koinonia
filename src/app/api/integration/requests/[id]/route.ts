import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id },
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
        appointmentRequest: { select: { id: true, status: true } },
      },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");

    const { scope } = await requireIntegrationAccess(req.churchId);

    if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
      throw new ApiError(403, "Accès refusé");

    return successResponse(req);
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    assignedFamilyId: z.number().int(),
    assignedFamilyName: z.string().min(1),
    assignedBergerId: z.string().min(1),
  }),
  z.object({ action: z.literal("contact") }),
  z.object({ action: z.literal("whatsapp") }),
  z.object({ action: z.literal("integrate") }),
  z.object({
    action: z.literal("abandon"),
    abandonReason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("note"),
    notes: z.string().max(10000),
  }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("edit"),
    firstName:    z.string().min(1).max(100).optional(),
    lastName:     z.string().min(1).max(100).optional(),
    phone:        z.string().min(1).max(30).optional(),
    email:        z.string().email().optional().or(z.literal("")).optional(),
    address:      z.string().max(500).optional().or(z.literal("")).optional(),
    ageRange:     z.enum(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"]).optional(),
    churchStatus: z.enum(["VISITOR", "REGULAR", "ENGAGED"]).optional(),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const req = await prisma.familyIntegrationRequest.findUnique({
      where: { id },
      select: {
        id: true,
        churchId: true,
        status: true,
        firstName: true,
        lastName: true,
        assignedFamilyId: true,
        assignedFamilyName: true,
        assignedBergerId: true,
      },
    });
    if (!req) throw new ApiError(404, "Demande introuvable");

    const { session, scope } = await requireIntegrationAccess(req.churchId);

    if (scope.scoped && req.assignedFamilyId && !scope.familyIds.includes(req.assignedFamilyId))
      throw new ApiError(403, "Accès refusé");

    const isIntegrationMember = !scope.scoped;
    const isAssignedBerger = req.assignedBergerId === session.user.id;

    const body = patchSchema.parse(await request.json());
    const now = new Date();

    // Vérifications de rôle par action
    const integrationMemberOnly = ["assign", "reopen"];
    const bergerOrIntegrationMember = ["contact", "whatsapp", "integrate", "abandon", "note", "edit"];
    if (integrationMemberOnly.includes(body.action) && !isIntegrationMember)
      throw new ApiError(403, "Cette action est réservée aux membres de l'équipe intégration");
    if (bergerOrIntegrationMember.includes(body.action) && !isIntegrationMember && !isAssignedBerger)
      throw new ApiError(403, "Cette action est réservée au berger assigné ou à l'équipe intégration");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateData: Record<string, any> = {};
    let notifyBergerId: string | null = null;

    switch (body.action) {
      case "assign":
        if (req.status !== "SUBMITTED" && req.status !== "ASSIGNED")
          throw new ApiError(400, "Transition invalide : la demande doit être SUBMITTED ou ASSIGNED");
        updateData = {
          status: "ASSIGNED",
          assignedFamilyId: body.assignedFamilyId,
          assignedFamilyName: body.assignedFamilyName,
          assignedBergerId: body.assignedBergerId,
          assignedAt: now,
        };
        notifyBergerId = body.assignedBergerId;
        break;

      case "contact":
        if (req.status !== "ASSIGNED")
          throw new ApiError(400, "Transition invalide : la demande doit être ASSIGNED");
        updateData = { status: "CONTACTED", contactedAt: now };
        break;

      case "whatsapp":
        if (req.status !== "CONTACTED")
          throw new ApiError(400, "Transition invalide : la demande doit être CONTACTED");
        updateData = { status: "WHATSAPP_ADDED", whatsappAddedAt: now };
        break;

      case "integrate":
        if (req.status !== "WHATSAPP_ADDED")
          throw new ApiError(400, "Transition invalide : la demande doit être WHATSAPP_ADDED");
        updateData = { status: "INTEGRATED", integratedAt: now };
        break;

      case "abandon":
        if (req.status === "INTEGRATED")
          throw new ApiError(400, "Impossible d'abandonner une demande déjà intégrée");
        updateData = {
          status: "ABANDONED",
          abandonedAt: now,
          abandonReason: body.abandonReason ?? null,
        };
        break;

      case "note":
        updateData = { notes: body.notes };
        break;

      case "reopen":
        if (req.status !== "ABANDONED")
          throw new ApiError(400, "Seule une demande abandonnée peut être rouverte");
        updateData = {
          status: "SUBMITTED",
          abandonedAt: null,
          abandonReason: null,
        };
        break;

      case "edit":
        updateData = {
          ...(body.firstName    !== undefined && { firstName:    body.firstName }),
          ...(body.lastName     !== undefined && { lastName:     body.lastName }),
          ...(body.phone        !== undefined && { phone:        body.phone || null }),
          ...(body.email        !== undefined && { email:        body.email || null }),
          ...(body.address      !== undefined && { address:      body.address || null }),
          ...(body.ageRange     !== undefined && { ageRange:     body.ageRange }),
          ...(body.churchStatus !== undefined && { churchStatus: body.churchStatus }),
        };
        break;
    }

    const updated = await prisma.familyIntegrationRequest.update({
      where: { id },
      data: updateData,
      include: {
        assignedBerger: { select: { id: true, name: true, email: true } },
      },
    });

    await logAudit({
      userId: session.user.id,
      churchId: req.churchId,
      action: "UPDATE",
      entityType: "FamilyIntegrationRequest",
      entityId: id,
      details: { action: body.action },
    });

    // Notifier le berger à l'affectation
    if (notifyBergerId) {
      const berger = await prisma.user.findUnique({
        where: { id: notifyBergerId },
        select: { id: true, name: true, email: true },
      });
      if (berger) {
        await prisma.notification.create({
          data: {
            userId: berger.id,
            type: "INTEGRATION_ASSIGNED",
            title: "Nouvelle demande d'intégration",
            message: `${req.firstName} ${req.lastName} vous a été affecté${updated.assignedFamilyName ? ` (${updated.assignedFamilyName})` : ""}.`,
            link: `/admin/integration/requests/${id}`,
          },
        }).catch(() => {});

        if (berger.email) {
          await sendEmail({
            to: berger.email,
            subject: "Nouvelle demande d'intégration vous a été affectée",
            html: buildBergerNotifEmail({
              bergerName: berger.name ?? berger.email,
              firstName: req.firstName,
              lastName: req.lastName,
              familyName: updated.assignedFamilyName,
              requestId: id,
            }),
          }).catch(() => {});
        }
      }
    }

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

function buildBergerNotifEmail(params: {
  bergerName: string;
  firstName: string;
  lastName: string;
  familyName: string | null;
  requestId: string;
}): string {
  const { bergerName, firstName, lastName, familyName, requestId } = params;
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#5E17EB;padding:28px 32px 20px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Nouvelle demande d'intégration</h1>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 14px;color:#111827;font-size:15px">Bonjour ${bergerName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6">
        Une demande d'intégration vient de vous être affectée :
      </p>
      <div style="background:#f5f3ff;border-left:4px solid #5E17EB;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
        <p style="margin:0;color:#111827;font-size:15px;font-weight:600">${firstName} ${lastName}</p>
        ${familyName ? `<p style="margin:4px 0 0;color:#6b7280;font-size:13px">Famille : ${familyName}</p>` : ""}
      </div>
      <a href="${appUrl}/admin/integration/requests/${requestId}"
         style="display:inline-block;background:#5E17EB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
        Voir la demande →
      </a>
    </div>
    <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;color:#9ca3af;font-size:11px">Notification automatique Koinonia.</p>
    </div>
  </div>
</body>
</html>`;
}
