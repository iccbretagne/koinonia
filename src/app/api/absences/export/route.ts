import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getUserDepartmentScope } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { findAbsenceConflicts } from "@/modules/planning";
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
  "Début",
  "Fin",
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

    let allowedMemberIds: string[] | null = null;
    const deptScope = getUserDepartmentScope(session, churchId);
    if (deptScope.scoped) {
      if (deptScope.departmentIds.length === 0) {
        allowedMemberIds = [];
      } else {
        const members = await prisma.memberDepartment.findMany({
          where: { departmentId: { in: deptScope.departmentIds } },
          select: { memberId: true },
        });
        allowedMemberIds = Array.from(new Set(members.map((m) => m.memberId)));
      }
    }

    const absences = await prisma.absence.findMany({
      where: {
        id: { in: absenceIds },
        churchId,
        ...(allowedMemberIds ? { memberId: { in: allowedMemberIds } } : {}),
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
      },
      orderBy: { startDate: "desc" },
    });

    const rows = await Promise.all(
      absences.map(async (a) => {
        const conflicts = await findAbsenceConflicts(a.memberId, a.churchId, a.startDate, a.endDate);
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
          Début: a.startDate.toLocaleDateString("fr-FR"),
          Fin: a.endDate.toLocaleDateString("fr-FR"),
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
