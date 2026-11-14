import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";

/**
 * Feuille de présence d'une session (spec 079, lot 2) : inscrits confirmés × jours × demi-journées.
 * Plusieurs intervenants peuvent la remplir en même temps : chaque case s'enregistre seule, la
 * dernière saisie l'emporte, et la page se relit régulièrement.
 */

export const HALVES = ["AM", "PM"] as const;
export const HALF_LABEL: Record<(typeof HALVES)[number], string> = { AM: "matin", PM: "après-midi" };

type ResponseFilter = Prisma.FormResponseWhereInput;

/** Nom à afficher d'un inscrit : son compte, à défaut ses premières réponses courtes, à défaut son adresse. */
export function participantName(
  response: { user: { name: string | null; displayName: string | null; email: string } | null; contactEmail: string | null; answers: { questionId: string; value: unknown }[] },
  shortTextIds: readonly string[]
): string {
  if (response.user) return response.user.displayName ?? response.user.name ?? response.user.email;
  const parts = shortTextIds
    .slice(0, 2)
    .map((id) => response.answers.find((a) => a.questionId === id)?.value)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return parts.length ? parts.join(" ") : (response.contactEmail ?? "Inscrit");
}

export async function getAttendanceSheet(formId: string, sessionId: string, scope: ResponseFilter) {
  const session = await prisma.formSession.findFirst({
    where: { id: sessionId, formId },
    include: { levels: { orderBy: { position: "asc" } } },
  });
  if (!session) throw new ApiError(404, "Session introuvable");
  const shortTexts = await prisma.formQuestion.findMany({ where: { formId, type: "SHORT_TEXT" }, orderBy: { position: "asc" }, select: { id: true } });
  const responses = await prisma.formResponse.findMany({
    where: { AND: [{ formId, sessionId, status: "CONFIRMED" }, scope] },
    include: {
      user: { select: { name: true, displayName: true, email: true } },
      answers: { select: { questionId: true, value: true } },
      attendance: { select: { day: true, half: true, present: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const levelCode = new Map(session.levels.map((l) => [l.id, l.code]));
  const ids = shortTexts.map((q) => q.id);
  return {
    session: { id: session.id, label: session.label, startDate: session.startDate.toISOString().slice(0, 10), days: session.days },
    rows: responses
      .map((r) => ({
        responseId: r.id,
        name: participantName(r, ids),
        level: r.levelId ? (levelCode.get(r.levelId) ?? "") : "",
        cells: Object.fromEntries(r.attendance.map((a) => [`${a.day}-${a.half}`, a.present])) as Record<string, boolean>,
      }))
      .sort((a, b) => a.level.localeCompare(b.level, "fr") || a.name.localeCompare(b.name, "fr")),
  };
}

export interface AttendanceCell {
  responseId: string;
  day: 1 | 2;
  half: "AM" | "PM";
  present: boolean;
}

/** Enregistre des cases (dernière saisie gagnante). Renvoie les cases réellement modifiées. */
export async function saveAttendance(formId: string, sessionId: string, cells: AttendanceCell[], scope: ResponseFilter, userId: string) {
  const session = await prisma.formSession.findFirst({ where: { id: sessionId, formId }, select: { days: true } });
  if (!session) throw new ApiError(404, "Session introuvable");
  if (cells.some((c) => c.day > session.days)) throw new ApiError(400, "Jour hors de la session");
  const ids = [...new Set(cells.map((c) => c.responseId))];
  const allowed = await prisma.formResponse.findMany({
    where: { AND: [{ id: { in: ids }, formId, sessionId, status: "CONFIRMED" }, scope] },
    select: { id: true, attendance: { select: { day: true, half: true, present: true } } },
  });
  if (allowed.length !== ids.length) throw new ApiError(404, "Inscrit introuvable");
  const current = new Map(allowed.flatMap((r) => r.attendance.map((a) => [`${r.id}-${a.day}-${a.half}`, a.present] as const)));
  const changed = cells.filter((c) => current.get(`${c.responseId}-${c.day}-${c.half}`) !== c.present);
  await prisma.$transaction(
    changed.map((c) =>
      prisma.formAttendance.upsert({
        where: { responseId_day_half: { responseId: c.responseId, day: c.day, half: c.half } },
        create: { responseId: c.responseId, day: c.day, half: c.half, present: c.present, updatedById: userId },
        update: { present: c.present, updatedById: userId },
      })
    )
  );
  return changed;
}
