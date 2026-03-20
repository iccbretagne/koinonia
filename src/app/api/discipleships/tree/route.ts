import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Arbre de lignée récursif à profondeur illimitée via WITH RECURSIVE
export async function GET(request: Request) {
  try {
    await requirePermission("discipleship:view");

    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    const rootId = searchParams.get("rootId"); // memberId racine (FD)

    if (!churchId) throw new ApiError(400, "churchId requis");

    type TreeRow = {
      id: string;
      discipleId: string;
      discipleMakerId: string;
      firstMakerId: string;
      depth: number;
      path: string; // chemin d'IDs séparés par '/'
    };

    let rows: TreeRow[];

    if (rootId) {
      // Arbre depuis un FD donné
      rows = await prisma.$queryRaw<TreeRow[]>`
        WITH RECURSIVE tree AS (
          SELECT
            d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
            0 AS depth,
            CAST(d.discipleId AS CHAR(1000)) AS path
          FROM discipleships d
          WHERE d.discipleMakerId = ${rootId} AND d.churchId = ${churchId}

          UNION ALL

          SELECT
            d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
            t.depth + 1,
            CONCAT(t.path, '/', d.discipleId)
          FROM discipleships d
          INNER JOIN tree t ON d.discipleMakerId = t.discipleId
          WHERE d.churchId = ${churchId}
        )
        SELECT * FROM tree
        ORDER BY depth ASC, path ASC
      `;
    } else {
      // Arbre complet de l'église
      rows = await prisma.$queryRaw<TreeRow[]>`
        WITH RECURSIVE tree AS (
          SELECT
            d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
            0 AS depth,
            CAST(d.discipleId AS CHAR(1000)) AS path
          FROM discipleships d
          WHERE d.churchId = ${churchId}
            AND d.discipleMakerId NOT IN (
              SELECT discipleId FROM discipleships WHERE churchId = ${churchId}
            )

          UNION ALL

          SELECT
            d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
            t.depth + 1,
            CONCAT(t.path, '/', d.discipleId)
          FROM discipleships d
          INNER JOIN tree t ON d.discipleMakerId = t.discipleId
          WHERE d.churchId = ${churchId}
        )
        SELECT * FROM tree
        ORDER BY depth ASC, path ASC
      `;
    }

    // Enrichir avec les noms des membres
    const memberIds = new Set<string>();
    for (const r of rows) {
      memberIds.add(r.discipleId);
      memberIds.add(r.discipleMakerId);
      memberIds.add(r.firstMakerId);
    }

    const members = await prisma.member.findMany({
      where: { id: { in: Array.from(memberIds) } },
      select: { id: true, firstName: true, lastName: true, department: { select: { name: true, ministry: { select: { name: true } } } } },
    });
    const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));

    const enriched = rows.map((r) => ({
      ...r,
      depth: Number(r.depth),
      disciple: memberMap[r.discipleId],
      discipleMaker: memberMap[r.discipleMakerId],
      firstMaker: memberMap[r.firstMakerId],
    }));

    return successResponse(enriched);
  } catch (error) {
    return errorResponse(error);
  }
}
