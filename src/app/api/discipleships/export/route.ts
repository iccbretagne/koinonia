import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import * as XLSX from "xlsx";

/**
 * Neutralise les valeurs pouvant être interprétées comme des formules Excel.
 * Préfixe avec une apostrophe les chaînes commençant par =, +, -, @ ou tab/CR.
 */
function sanitizeExcelValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const sanitized = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeExcelValue(value);
  }
  return sanitized as T;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("discipleship:export", churchId);

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : defaultTo;

    const trackedEvents = await prisma.event.findMany({
      where: { churchId, trackedForDiscipleship: true, date: { gte: from, lte: to } },
      select: { id: true, title: true, date: true },
      orderBy: { date: "asc" },
    });

    const discipleships = await prisma.discipleship.findMany({
      where: { churchId },
      include: {
        disciple: { select: { firstName: true, lastName: true, department: { select: { name: true, ministry: { select: { name: true } } } } } },
        discipleMaker: { select: { firstName: true, lastName: true } },
        firstMaker: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ discipleMaker: { lastName: "asc" } }, { disciple: { lastName: "asc" } }],
    });

    const eventIds = trackedEvents.map((e) => e.id);
    const attendances = eventIds.length > 0
      ? await prisma.discipleshipAttendance.findMany({
          where: { eventId: { in: eventIds }, present: true },
          select: { memberId: true, eventId: true },
        })
      : [];

    const presenceMap = new Map<string, Set<string>>();
    for (const a of attendances) {
      if (!presenceMap.has(a.memberId)) presenceMap.set(a.memberId, new Set());
      presenceMap.get(a.memberId)!.add(a.eventId);
    }

    // Feuille principale : disciples + stats
    const statsRows = discipleships.map((d) => {
      const present = presenceMap.get(d.discipleId)?.size ?? 0;
      const total = trackedEvents.length;
      return {
        "Disciple (Nom)": d.disciple.lastName,
        "Disciple (Prénom)": d.disciple.firstName,
        "Ministère": d.disciple.department.ministry.name,
        "Département": d.disciple.department.name,
        "FD actuel": `${d.discipleMaker.firstName} ${d.discipleMaker.lastName}`,
        "Premier FD": `${d.firstMaker.firstName} ${d.firstMaker.lastName}`,
        "Présences": present,
        "Événements suivis": total,
        "Absences": total - present,
        "Taux (%)": total > 0 ? Math.round((present / total) * 100) : "",
      };
    });

    // Feuille présences détaillées par événement
    const detailRows: Record<string, string | number>[] = [];
    for (const d of discipleships) {
      for (const e of trackedEvents) {
        const present = presenceMap.get(d.discipleId)?.has(e.id) ?? false;
        detailRows.push({
          "Disciple": `${d.disciple.firstName} ${d.disciple.lastName}`,
          "FD actuel": `${d.discipleMaker.firstName} ${d.discipleMaker.lastName}`,
          "Événement": e.title,
          "Date": new Date(e.date).toLocaleDateString("fr-FR"),
          "Présent": present ? "Oui" : "Non",
        });
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statsRows.map(sanitizeRow)), "Statistiques");
    if (detailRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows.map(sanitizeRow)), "Détail présences");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const month = from.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const filename = `discipolat-${month.replace(/\s/g, "-")}.xlsx`;

    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
