import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-utils";
import { sanitizeRow } from "@/lib/excel";
import { logAudit } from "@/lib/audit";
import {
  requireIntegrationExportAccess,
  buildIntegrationExportRows,
  EXPORT_COLUMNS,
} from "@/modules/integration";
import ExcelJS from "exceljs";
import { z } from "zod";

const exportSchema = z.object({
  churchId: z.string().min(1),
  requestIds: z.array(z.string().min(1)).min(1).max(2000),
});

/**
 * POST /api/integration/requests/export — génère un classeur Excel à partir d'une liste
 * d'IDs de demandes (celles actuellement affichées côté client, filtres déjà appliqués).
 *
 * Sécurité :
 *  - réservé à l'équipe Intégration / Admin / Secrétaire / Super Admin
 *    (`requireIntegrationExportAccess` refuse un périmètre berger restreint) ;
 *  - `churchId` et `archivedAt: null` sont réimposés dans la requête : le navigateur ne
 *    peut pas exfiltrer une autre église ni une demande archivée ;
 *  - chaque export est journalisé (auteur, nombre de lignes réellement écrites).
 */
export async function POST(request: Request) {
  try {
    const { churchId, requestIds } = exportSchema.parse(await request.json());
    const { session } = await requireIntegrationExportAccess(churchId);

    const requests = await prisma.familyIntegrationRequest.findMany({
      where: { id: { in: requestIds }, churchId, archivedAt: null },
      include: { assignedBerger: { select: { name: true, displayName: true } } },
      orderBy: { submittedAt: "desc" },
    });

    const rows = buildIntegrationExportRows(requests).map(sanitizeRow);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Demandes d'intégration");
    sheet.columns = EXPORT_COLUMNS.map((key) => ({ header: key, key }));
    for (const row of rows) sheet.addRow(row);

    const buf = await wb.xlsx.writeBuffer();
    const filename = `demandes-integration-${new Date().toISOString().slice(0, 10)}.xlsx`;

    await logAudit({
      userId: session.user.id!,
      churchId,
      action: "EXPORT",
      entityType: "FamilyIntegrationRequest",
      entityId: "list",
      details: { count: rows.length },
    });

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
