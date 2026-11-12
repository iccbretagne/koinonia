import type { Session } from "next-auth";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";
import type { upsertSchema } from "./contract";

export type ReportInput = z.infer<typeof upsertSchema>;

/**
 * Crée ou remplace le compte rendu complet d'un événement (même code pour l'écran et l'assistant
 * IA — spec 081, lot 3b). L'appelant a déjà vérifié `reports:edit` (ou `events:manage`) dans
 * l'église de l'événement ; ici : comptes rendus activés, départements de l'église, écriture,
 * journal.
 */
export async function saveReport(
  session: Session,
  event: { id: string; churchId: string; reportEnabled: boolean },
  { speaker, messageTitle, notes, decisions, sections }: ReportInput,
  details: Record<string, unknown> = {}
) {
  if (!event.reportEnabled) throw new ApiError(403, "Les comptes rendus ne sont pas activés pour cet événement");
  const eventId = event.id;

  // Validate all departmentIds belong to the event's church
  const deptIds = sections.map((s) => s.departmentId).filter((id): id is string => id !== null && id !== undefined);
  if (deptIds.length > 0) {
    const validDepts = await prisma.department.findMany({
      where: { id: { in: deptIds }, ministry: { churchId: event.churchId } },
      select: { id: true },
    });
    if (validDepts.length !== new Set(deptIds).size) {
      throw new ApiError(400, "Un ou plusieurs départements n'appartiennent pas à cette église");
    }
  }

  const sectionData = sections.map((s, i) => ({
    departmentId: s.departmentId ?? null,
    label: s.label,
    position: s.position ?? i,
    stats: (s.stats as Prisma.InputJsonValue) ?? Prisma.DbNull,
    notes: s.notes ?? null,
  }));

  const report = await prisma.eventReport.upsert({
    where: { eventId },
    create: {
      eventId,
      churchId: event.churchId,
      authorId: session.user.id,
      speaker: speaker ?? null,
      messageTitle: messageTitle ?? null,
      notes: notes ?? null,
      decisions: decisions ?? null,
      sections: { create: sectionData },
    },
    update: {
      speaker: speaker ?? null,
      messageTitle: messageTitle ?? null,
      notes: notes ?? null,
      decisions: decisions ?? null,
      sections: {
        deleteMany: {},
        create: sectionData,
      },
    },
    include: {
      sections: {
        include: { department: { select: { id: true, name: true, ministry: { select: { name: true } } } } },
        orderBy: { position: "asc" },
      },
      author: { select: { id: true, name: true } },
    },
  });

  await logAudit({ userId: session.user.id, churchId: event.churchId, action: "UPDATE", entityType: "EventReport", entityId: report.id, details: { eventId, ...details } });

  return report;
}
