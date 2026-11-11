import { prisma } from "@/lib/prisma";

export type McpCallOutcome = "answered" | "refused" | "error" | "limited";

/** Journal d'un appel d'outil, sans contenu (spec 081). Une erreur d'écriture n'empêche pas la réponse. */
export async function recordMcpCall(entry: { grantId: string; userId: string; churchId: string; tool: string; outcome: McpCallOutcome }) {
  try {
    await prisma.mcpCall.create({ data: entry });
  } catch {
    // Journal best-effort : ne bloque jamais l'outil.
  }
}

/** Compteurs d'instance pour le Super Admin : connexions actives et appels sur 30 jours, par église. */
export async function mcpUsageStats(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [connections, calls] = await Promise.all([
    prisma.mcpGrant.groupBy({
      by: ["churchId"],
      where: { revokedAt: null, tokens: { some: { kind: "REFRESH", usedAt: null, expiresAt: { gt: now } } } },
      _count: { _all: true },
    }),
    prisma.mcpCall.groupBy({ by: ["churchId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const churchIds = [...new Set([...connections.map((c) => c.churchId), ...calls.map((c) => c.churchId)])];
  const churches = await prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } });
  const name = new Map(churches.map((c) => [c.id, c.name]));
  return churchIds
    .map((id) => ({
      churchId: id,
      churchName: name.get(id) ?? "—",
      connections: connections.find((c) => c.churchId === id)?._count._all ?? 0,
      calls30d: calls.find((c) => c.churchId === id)?._count._all ?? 0,
    }))
    .sort((a, b) => b.calls30d - a.calls30d);
}
