import { prisma } from "@/lib/prisma";
import { requireChurchPermission, getDiscipleshipScope } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

// Arbre de lignée récursif à profondeur illimitée via WITH RECURSIVE
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    // mode: "primary" = traversal via firstMakerId (lignée d'origine)
    //       "current"  = traversal via discipleMakerId (structure actuelle)
    const mode = searchParams.get("mode") === "current" ? "current" : "primary";

    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("discipleship:view", churchId);

    // DISCIPLE_MAKER : l'arbre est ancré sur son propre nœud (ignore rootId du client)
    const scope = await getDiscipleshipScope(session, churchId);
    const rootId = scope.scoped ? scope.memberId : searchParams.get("rootId");

    type TreeRow = {
      id: string;
      discipleId: string;
      discipleMakerId: string;
      firstMakerId: string;
      depth: number;
      path: string; // chemin d'IDs séparés par '/'
    };

    let rows: TreeRow[];

    if (mode === "current") {
      // Structure actuelle — traversal via discipleMakerId
      const anchor = rootId
        ? prisma.$queryRaw<TreeRow[]>`
            WITH RECURSIVE tree AS (
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                0 AS depth, CAST(d.discipleId AS CHAR(1000)) AS path
              FROM discipleships d
              WHERE d.discipleMakerId = ${rootId} AND d.churchId = ${churchId}
              UNION ALL
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                t.depth + 1, CONCAT(t.path, '/', d.discipleId)
              FROM discipleships d
              INNER JOIN tree t ON d.discipleMakerId = t.discipleId
              WHERE d.churchId = ${churchId}
            )
            SELECT * FROM tree ORDER BY depth ASC, path ASC`
        : prisma.$queryRaw<TreeRow[]>`
            WITH RECURSIVE tree AS (
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                0 AS depth, CAST(d.discipleId AS CHAR(1000)) AS path
              FROM discipleships d
              WHERE d.churchId = ${churchId}
                AND d.discipleMakerId NOT IN (
                  SELECT discipleId FROM discipleships WHERE churchId = ${churchId}
                )
              UNION ALL
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                t.depth + 1, CONCAT(t.path, '/', d.discipleId)
              FROM discipleships d
              INNER JOIN tree t ON d.discipleMakerId = t.discipleId
              WHERE d.churchId = ${churchId}
            )
            SELECT * FROM tree ORDER BY depth ASC, path ASC`;
      rows = await anchor;
    } else {
      // Lignée primaire — traversal via firstMakerId
      const anchor = rootId
        ? prisma.$queryRaw<TreeRow[]>`
            WITH RECURSIVE tree AS (
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                0 AS depth, CAST(d.discipleId AS CHAR(1000)) AS path
              FROM discipleships d
              WHERE d.firstMakerId = ${rootId} AND d.churchId = ${churchId}
              UNION ALL
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                t.depth + 1, CONCAT(t.path, '/', d.discipleId)
              FROM discipleships d
              INNER JOIN tree t ON d.firstMakerId = t.discipleId
              WHERE d.churchId = ${churchId}
            )
            SELECT * FROM tree ORDER BY depth ASC, path ASC`
        : prisma.$queryRaw<TreeRow[]>`
            WITH RECURSIVE tree AS (
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                0 AS depth, CAST(d.discipleId AS CHAR(1000)) AS path
              FROM discipleships d
              WHERE d.churchId = ${churchId}
                AND d.firstMakerId NOT IN (
                  SELECT discipleId FROM discipleships WHERE churchId = ${churchId}
                )
              UNION ALL
              SELECT d.id, d.discipleId, d.discipleMakerId, d.firstMakerId,
                t.depth + 1, CONCAT(t.path, '/', d.discipleId)
              FROM discipleships d
              INNER JOIN tree t ON d.firstMakerId = t.discipleId
              WHERE d.churchId = ${churchId}
            )
            SELECT * FROM tree ORDER BY depth ASC, path ASC`;
      rows = await anchor;
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
