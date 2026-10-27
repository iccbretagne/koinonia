import type { SystemMessageSeverity } from "@/generated/prisma/client";
import { isInAudience, loadViewerFacts } from "./audience";
import { parseAudience } from "./messages";

/**
 * Bandeau des messages système (spec 071) : messages en cours d'une église de la personne ou de
 * l'instance, dont elle fait partie du public, sauf ceux qu'elle a fermés (un message urgent ne
 * se ferme pas). Les plus graves d'abord, puis les plus récents.
 */

export interface BannerMessage {
  id: string;
  title: string;
  body: string;
  severity: SystemMessageSeverity;
}

const SEVERITY_RANK: Record<SystemMessageSeverity, number> = { URGENT: 0, IMPORTANT: 1, INFO: 2 };

export async function getActiveBannerMessages(
  viewer: { userId: string; churchIds: string[] },
  now = new Date()
): Promise<BannerMessage[]> {
  if (viewer.churchIds.length === 0) return [];
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.systemMessage.findMany({
    where: {
      withdrawnAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
      OR: [{ churchId: { in: viewer.churchIds } }, { churchId: null }],
    },
    select: {
      id: true,
      churchId: true,
      title: true,
      body: true,
      severity: true,
      audience: true,
      startsAt: true,
      receipts: { where: { userId: viewer.userId }, select: { dismissedAt: true } },
    },
  });
  const visible = rows.filter((row) => row.severity === "URGENT" || !row.receipts[0]?.dismissedAt);
  if (visible.length === 0) return [];

  const churchIds = visible.some((row) => row.churchId === null)
    ? viewer.churchIds
    : viewer.churchIds.filter((id) => visible.some((row) => row.churchId === id));
  const facts = await loadViewerFacts(viewer.userId, churchIds);

  return visible
    .filter((row) => isInAudience({ churchId: row.churchId, audience: parseAudience(row.audience) }, facts))
    .sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.startsAt.getTime() - a.startsAt.getTime()
    )
    .map((row) => ({ id: row.id, title: row.title, body: row.body, severity: row.severity }));
}
