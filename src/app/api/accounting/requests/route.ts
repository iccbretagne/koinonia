import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { rolePermissions } from "@/lib/registry";
import { sendEmail, buildAccountingNewRequestEmail } from "@/lib/email";
import { z } from "zod";

const createSchema = z.object({
  type:        z.enum(["EXPENSE_REPORT", "BUDGET_ADVANCE"]),
  label:       z.string().min(1).max(200),
  description: z.string().optional(),
  amount:      z.number().positive(),
  departmentId: z.string().min(1),
  attachmentIds: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("accounting:view");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const { searchParams } = new URL(request.url);
    const status     = searchParams.get("status") ?? undefined;
    const departmentId = searchParams.get("departmentId") ?? undefined;
    const type       = searchParams.get("type") ?? undefined;

    // Scope : DEPARTMENT_HEAD voit uniquement ses départements
    const roles = session.user.churchRoles.filter((r) => r.churchId === churchId).map((r) => r.role);
    const canManage = roles.flatMap((r) => rolePermissions[r] ?? []).includes("accounting:manage");
    let deptFilter: string[] | undefined;
    if (!canManage) {
      const userRoles = await prisma.userChurchRole.findMany({
        where: { userId: session.user.id!, churchId },
        include: { departments: { select: { departmentId: true } } },
      });
      deptFilter = userRoles.flatMap((r) => r.departments.map((d) => d.departmentId));
      if (deptFilter.length === 0) return successResponse([]);
    }

    const requests = await prisma.financialRequest.findMany({
      where: {
        churchId,
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        ...(departmentId ? { departmentId } : deptFilter ? { departmentId: { in: deptFilter } } : {}),
      },
      include: {
        department:  { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        processedBy: { select: { id: true, name: true } },
        payments:    { orderBy: { scheduledDate: "asc" } },
        attachments: { select: { id: true, filename: true, mimeType: true, size: true, s3Key: true } },
        series:      { select: { id: true, label: true, recurrenceEvery: true, recurrenceUnit: true } },
        correctionOf: { select: { id: true, label: true } },
        _count:      { select: { corrections: true } },
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
    const session = await requirePermission("accounting:submit");
    const churchId = await getCurrentChurchId(session);
    if (!churchId) throw new ApiError(400, "Aucune église sélectionnée");

    const body = createSchema.parse(await request.json());

    // Vérifier que le département appartient à l'église
    const dept = await prisma.department.findFirst({
      where: { id: body.departmentId, ministry: { churchId } },
    });
    if (!dept) throw new ApiError(404, "Département introuvable");

    const req = await prisma.financialRequest.create({
      data: {
        churchId,
        departmentId: body.departmentId,
        submittedById: session.user.id!,
        type:        body.type,
        label:       body.label,
        description: body.description,
        amount:      body.amount,
        status:      "SUBMITTED",
        ...(body.attachmentIds?.length
          ? { attachments: { connect: body.attachmentIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        department:  { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        attachments: true,
        payments:    true,
      },
    });

    // Notification email compta + in-app (best-effort)
    notifyAccountingTeam(churchId, req).catch(() => {});

    return successResponse(req, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifyAccountingTeam(
  churchId: string,
  req: { id: string; label: string; type: string; description: string | null; amount: unknown; department: { name: string }; submittedBy: { name: string | null; email: string | null } }
) {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { accountingEmail: true, name: true },
  });

  // Notif in-app pour tous les ACCOUNTANT de l'église
  const accountants = await prisma.userChurchRole.findMany({
    where: { churchId, role: "ACCOUNTANT" },
    select: { userId: true },
  });

  if (accountants.length > 0) {
    await prisma.notification.createMany({
      data: accountants.map(({ userId }) => ({
        userId,
        type:    "ACCOUNTING_NEW_REQUEST",
        title:   "Nouvelle demande financière",
        message: `${req.type === "EXPENSE_REPORT" ? "Note de frais" : "Avance de budget"} : ${req.label}`,
        link:    `/accounting/requests/${req.id}`,
      })),
    });
  }

  // Email à l'adresse comptabilité configurée
  if (church?.accountingEmail) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const amount = Number(req.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    const { subject, html } = buildAccountingNewRequestEmail({
      requestLabel:   req.label,
      requestAmount:  amount,
      requestType:    req.type,
      departmentName: req.department.name,
      submitterName:  req.submittedBy.name ?? req.submittedBy.email ?? "—",
      description:    req.description,
      churchName:     church.name,
      requestUrl:     `${appUrl}/accounting/requests/${req.id}`,
    });
    sendEmail({ to: church.accountingEmail, subject, html })
      .catch((err) => console.error("[accounting] sendEmail to accountingEmail failed:", err?.message ?? err));
  }
}
