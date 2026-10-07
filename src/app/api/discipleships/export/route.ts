import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import { sanitizeRow } from "@/lib/excel";
import ExcelJS from "exceljs";

type ExportDiscipleship = {
  discipleId: string;
  disciple: {
    firstName: string;
    lastName: string;
    departments: { department: { name: string; ministry: { name: string } | null } | null }[];
  };
  discipleMaker: { firstName: string; lastName: string };
  firstMaker: { firstName: string; lastName: string };
};
type TrackedEvent = { id: string; title: string; date: Date };

/** Période demandée, par défaut le mois en cours. */
function exportRange(searchParams: URLSearchParams) {
  const now = new Date();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  return {
    from: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
    to: to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

/** Événements suivis auxquels chaque membre était présent. */
async function presenceByMember(eventIds: string[]) {
  const presenceMap = new Map<string, Set<string>>();
  if (eventIds.length === 0) return presenceMap;
  const attendances = await prisma.discipleshipAttendance.findMany({
    where: { eventId: { in: eventIds }, present: true },
    select: { memberId: true, eventId: true },
  });
  for (const a of attendances) {
    if (!presenceMap.has(a.memberId)) presenceMap.set(a.memberId, new Set());
    presenceMap.get(a.memberId)!.add(a.eventId);
  }
  return presenceMap;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

function statsRow(d: ExportDiscipleship, present: number, total: number) {
  const primary = d.disciple.departments[0]?.department;
  return {
    "Disciple (Nom)": d.disciple.lastName,
    "Disciple (Prénom)": d.disciple.firstName,
    "Ministère": primary?.ministry?.name ?? "",
    "Département": primary?.name ?? "",
    "FD actuel": fullName(d.discipleMaker),
    "Premier FD": fullName(d.firstMaker),
    "Présences": present,
    "Événements suivis": total,
    "Absences": total - present,
    "Taux (%)": total > 0 ? Math.round((present / total) * 100) : "",
  };
}

function detailRows(discipleships: ExportDiscipleship[], events: TrackedEvent[], presence: Map<string, Set<string>>) {
  return discipleships.flatMap((d) =>
    events.map((e) => ({
      "Disciple": fullName(d.disciple),
      "FD actuel": fullName(d.discipleMaker),
      "Événement": e.title,
      "Date": new Date(e.date).toLocaleDateString("fr-FR"),
      "Présent": presence.get(d.discipleId)?.has(e.id) ? "Oui" : "Non",
    }))
  );
}

/** Remplit une feuille avec des lignes déjà assainies, colonnes déduites de la première. */
function fillSheet(sheet: ExcelJS.Worksheet, rows: Record<string, string | number>[]) {
  const sanitized = rows.map(sanitizeRow);
  if (sanitized.length === 0) return;
  sheet.columns = Object.keys(sanitized[0]).map((key) => ({ header: key, key }));
  for (const row of sanitized) {
    sheet.addRow(row);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("discipleship:export", churchId);

    const { from, to } = exportRange(searchParams);

    const trackedEvents = await prisma.event.findMany({
      where: { churchId, trackedForDiscipleship: true, date: { gte: from, lte: to } },
      select: { id: true, title: true, date: true },
      orderBy: { date: "asc" },
    });

    const discipleships = await prisma.discipleship.findMany({
      where: { churchId },
      include: {
        disciple: { select: { firstName: true, lastName: true, departments: { where: { isPrimary: true }, select: { department: { select: { name: true, ministry: { select: { name: true } } } } } } } },
        discipleMaker: { select: { firstName: true, lastName: true } },
        firstMaker: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ discipleMaker: { lastName: "asc" } }, { disciple: { lastName: "asc" } }],
    });

    const presenceMap = await presenceByMember(trackedEvents.map((e) => e.id));
    const total = trackedEvents.length;

    const wb = new ExcelJS.Workbook();
    // Feuille principale : disciples + stats
    fillSheet(
      wb.addWorksheet("Statistiques"),
      discipleships.map((d) => statsRow(d, presenceMap.get(d.discipleId)?.size ?? 0, total))
    );
    // Feuille présences détaillées par événement, seulement si elle a des lignes
    const details = detailRows(discipleships, trackedEvents, presenceMap);
    if (details.length > 0) fillSheet(wb.addWorksheet("Détail présences"), details);

    const buf = await wb.xlsx.writeBuffer();
    const month = from.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const filename = `discipolat-${month.replace(/\s/g, "-")}.xlsx`;

    return new Response(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
