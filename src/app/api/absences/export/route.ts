import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { findAbsenceConflicts, absenceVisibilityWhere } from "@/modules/planning";
import { sanitizeRow } from "@/lib/excel";
import ExcelJS from "exceljs";
import { z } from "zod";

const exportSchema = z.object({
  churchId: z.string().min(1),
  absenceIds: z.array(z.string().min(1)).max(1000),
});

const COLUMNS = [
  "STAR",
  "Département",
  "Ministère",
  "Ciblage",
  "Début",
  "Fin",
  "Événements visés",
  "Motif",
  "Statut",
  "Conflit",
  "Backup(s)",
  "Déclaré par",
] as const;

/**
 * POST /api/absences/export — génère un classeur Excel à partir d'une liste d'IDs
 * d'absences (celles actuellement affichées côté client, filtres déjà appliqués).
 *
 * Le périmètre de visibilité est revérifié serveur : tout ID hors périmètre de
 * l'appelant est silencieusement exclu du fichier généré.
 */
export async function POST(request: Request) {
  try {
    const { churchId, absenceIds } = exportSchema.parse(await request.json());
    const session = await requireChurchPermission("absences:view", churchId);

    let visibilityWhere: ReturnType<typeof absenceVisibilityWhere> | undefined;
    const deptScope = getUserDepartmentScope(session, churchId);
    if (deptScope.scoped) {
      visibilityWhere = deptScope.departmentIds.length > 0 ? absenceVisibilityWhere(deptScope.departmentIds) : { id: "" };
    }

    const absences = await prisma.absence.findMany({
      where: {
        id: { in: absenceIds },
        churchId,
        ...(visibilityWhere ? { AND: [visibilityWhere] } : {}),
      },
      include: {
        member: {
          select: {
            firstName: true,
            lastName: true,
            departments: {
              select: { department: { select: { name: true, ministry: { select: { name: true } } } } },
            },
          },
        },
        createdBy: { select: { name: true, displayName: true } },
        backups: {
          select: {
            type: true,
            member: { select: { firstName: true, lastName: true } },
            userChurchRole: { select: { user: { select: { name: true, displayName: true } } } },
          },
        },
        targetDepartments: { select: { departmentId: true, department: { select: { name: true } } } },
        targetEvents: { select: { eventId: true, eventTitle: true, eventDate: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = await Promise.all(
      absences.map(async (a) => {
        const targetDepartmentIds = a.targetDepartments.map((d) => d.departmentId);
        const targetEventIds = a.targetEvents.map((e) => e.eventId).filter((id): id is string => id !== null);
        const conflicts = await findAbsenceConflicts(a.memberId, a.churchId, {
          kind: a.kind,
          startDate: a.startDate,
          endDate: a.endDate,
          eventIds: targetEventIds,
          allDepartments: a.allDepartments,
          departmentIds: targetDepartmentIds,
        });
        const backupNames = a.backups.map((b) =>
          b.type === "STAR"
            ? `${b.member!.firstName} ${b.member!.lastName}`
            : (b.userChurchRole!.user.displayName ?? b.userChurchRole!.user.name ?? "")
        );
        return {
          STAR: `${a.member.firstName} ${a.member.lastName}`,
          Département: a.member.departments.map((d) => d.department.name).join(", "),
          Ministère: Array.from(
            new Set(a.member.departments.map((d) => d.department.ministry.name))
          ).join(", "),
          Ciblage: a.allDepartments
            ? "Tous"
            : a.targetDepartments.map((d) => d.department.name).join(", "),
          Début: a.startDate ? a.startDate.toLocaleDateString("fr-FR") : "",
          Fin: a.endDate ? a.endDate.toLocaleDateString("fr-FR") : "",
          "Événements visés": a.targetEvents
            .map((e) => (e.eventId === null ? `${e.eventTitle} (événement supprimé)` : e.eventTitle))
            .join(", "),
          Motif: a.reason ?? "",
          Statut: a.status === "ACTIVE" ? "Active" : "Annulée",
          Conflit: conflicts.length > 0 ? "Oui" : "Non",
          "Backup(s)": backupNames.join(", "),
          "Déclaré par": a.createdBy.displayName ?? a.createdBy.name ?? "",
        };
      })
    );

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Absences");
    sheet.columns = COLUMNS.map((key) => ({ header: key, key }));
    for (const row of rows.map(sanitizeRow)) {
      sheet.addRow(row);
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `absences-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
