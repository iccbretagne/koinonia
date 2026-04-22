import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/api-utils";
import ExcelJS from "exceljs";

/**
 * Neutralise les valeurs pouvant être interprétées comme des formules Excel.
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

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");

    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("reports:view", churchId);

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : defaultTo;

    const church = await prisma.church.findUnique({
      where: { id: churchId },
      select: { name: true },
    });

    const reports = await prisma.eventReport.findMany({
      where: {
        churchId,
        event: { date: { gte: from, lte: to } },
      },
      include: {
        event: { select: { title: true, date: true, type: true } },
        sections: {
          select: { label: true, stats: true },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { event: { date: "desc" } },
    });

    const rows = reports.map((r) => {
      // Find Accueil section stats
      const accueil = r.sections.find((s) => norm(s.label) === "accueil");
      const stats = (accueil?.stats as Record<string, number | null> | null) ?? {};
      const hommes = stats["hommes"] ?? null;
      const femmes = stats["femmes"] ?? null;
      const enfants = stats["enfants"] ?? null;
      const totalAdultes = hommes !== null && femmes !== null ? hommes + femmes : null;

      // Find Integration section stats
      const integration = r.sections.find((s) => {
        const n = norm(s.label);
        return n === "integration" || n.startsWith("integration");
      });
      const intStats = (integration?.stats as Record<string, number | null> | null) ?? {};

      // Find Sainte Cène section stats
      const sainteCene = r.sections.find((s) => norm(s.label).includes("sainte") && norm(s.label).includes("cene"));
      const ceneStats = (sainteCene?.stats as Record<string, number | null> | null) ?? {};

      // Find Navette section stats
      const navette = r.sections.find((s) => norm(s.label).includes("navette"));
      const navStats = (navette?.stats as Record<string, number | null> | null) ?? {};
      const navHommes = navStats["hommes"] ?? null;
      const navFemmes = navStats["femmes"] ?? null;
      const navEnfants = navStats["enfants"] ?? null;
      const navTotal = navHommes !== null && navFemmes !== null ? navHommes + navFemmes + (navEnfants ?? 0) : null;

      return {
        "Date du culte": new Date(r.event.date).toLocaleDateString("fr-FR"),
        "Église": church?.name ?? "",
        "Orateur": r.speaker ?? "",
        "Titre du message": r.messageTitle ?? "",
        "Hommes": hommes,
        "Femmes": femmes,
        "Enfants": enfants,
        "Total adultes": totalAdultes,
        "Total général": totalAdultes !== null ? totalAdultes + (enfants ?? 0) : null,
        "Nouveaux arrivants (H)": intStats["hommes"] ?? null,
        "Nouveaux arrivants (F)": intStats["femmes"] ?? null,
        "De passage": intStats["passage"] ?? null,
        "Nouveaux convertis": intStats["convertis"] ?? null,
        "Renouvellement vœux": intStats["voeux"] ?? null,
        "Cène — supports utilisés": ceneStats["supportsUtilises"] ?? null,
        "Cène — supports restants": ceneStats["supportsRestants"] ?? null,
        "Navette — Hommes": navHommes,
        "Navette — Femmes": navFemmes,
        "Navette — Enfants": navEnfants,
        "Navette — Total": navTotal,
      };
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Statistiques cultes");

    const sanitizedRows = rows.map(sanitizeRow);
    if (sanitizedRows.length > 0) {
      sheet.columns = Object.keys(sanitizedRows[0]).map((key) => ({
        header: key,
        key,
      }));
      for (const row of sanitizedRows) {
        sheet.addRow(row);
      }
    }

    const buf = await wb.xlsx.writeBuffer();

    const fromStr = from.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const toStr = to.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const period = fromStr === toStr ? fromStr : `${fromStr}-${toStr}`;
    const filename = `statistiques-cultes-${period.replace(/\s/g, "-")}.xlsx`;

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
