import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

/**
 * Publie (ou remplace) la consigne d'un département pour un événement (même code pour l'écran et
 * l'assistant IA — spec 081, lot 3). L'appelant a déjà vérifié `planning:edit` et le périmètre.
 */
export async function saveNotice(
  session: Session,
  churchId: string,
  departmentId: string,
  eventId: string,
  content: string,
  details: Record<string, unknown> = {}
) {
  // Validate event belongs to the same church
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { churchId: true },
  });
  if (event?.churchId !== churchId) {
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
    details: { departmentId, eventId, ...details },
  });

  return notice;
}
