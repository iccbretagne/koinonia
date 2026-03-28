import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    await requireChurchPermission("planning:view", churchId);

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "eventId requis");

    const notice = await prisma.departmentNotice.findUnique({
      where: { departmentId_eventId: { departmentId, eventId } },
      select: {
        content: true,
        updatedAt: true,
        author: { select: { name: true, displayName: true } },
      },
    });

    return successResponse(
      notice
        ? {
            content: notice.content,
            updatedAt: notice.updatedAt.toISOString(),
            authorName: notice.author.displayName ?? notice.author.name ?? null,
          }
        : null
    );
  } catch (error) {
    return errorResponse(error);
  }
}

const putSchema = z.object({
  eventId: z.string().min(1),
  content: z.string().max(2000),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("planning:edit", churchId);

    const { eventId, content } = putSchema.parse(await request.json());

    // Validate event belongs to the same church
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { churchId: true },
    });
    if (!event || event.churchId !== churchId) {
      throw new ApiError(404, "Événement introuvable");
    }

    const notice = await prisma.departmentNotice.upsert({
      where: { departmentId_eventId: { departmentId, eventId } },
      create: { departmentId, eventId, content, authorId: session.user.id },
      update: { content, authorId: session.user.id },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "UPDATE",
      entityType: "DepartmentNotice",
      entityId: notice.id,
      details: { departmentId, eventId },
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    const session = await requireChurchPermission("planning:edit", churchId);

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "eventId requis");

    const notice = await prisma.departmentNotice.findUnique({
      where: { departmentId_eventId: { departmentId, eventId } },
      select: { id: true },
    });
    if (!notice) throw new ApiError(404, "Notice introuvable");

    await prisma.departmentNotice.delete({
      where: { departmentId_eventId: { departmentId, eventId } },
    });

    await logAudit({
      userId: session.user.id,
      churchId,
      action: "DELETE",
      entityType: "DepartmentNotice",
      entityId: notice.id,
      details: { departmentId, eventId },
    });

    return successResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
