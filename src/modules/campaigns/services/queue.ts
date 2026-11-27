import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCampaignsManage, isChurchMember } from "../auth";

/**
 * Contributions soumises à valider (spec 092) dans les campagnes de l'église que la personne
 * pilote — `campaigns:manage` dans l'église, ou gestionnaire désigné (même règle que
 * `isCampaignManager` et que « Campagnes que je pilote »). Seuls des états sont comptés : aucune
 * valeur de réponse n'est lue. `null` si la personne ne pilote rien (aucune file, pas même vide).
 */
export async function countSubmittedContributions(
  session: Session,
  churchId: string
): Promise<{ count: number; perCampaign: { campaignId: string; count: number }[] } | null> {
  if (!isChurchMember(session, churchId)) return null;
  const manage = await hasCampaignsManage(session, churchId);
  const campaignWhere: Prisma.CampaignWhereInput = manage
    ? { churchId }
    : { churchId, managers: { some: { userId: session.user.id } } };
  const [managed, grouped] = await Promise.all([
    manage ? Promise.resolve(1) : prisma.campaign.count({ where: campaignWhere }),
    prisma.campaignAssignment.groupBy({
      by: ["campaignId"],
      where: { status: "SUBMITTED", campaign: campaignWhere },
      _count: { _all: true },
    }),
  ]);
  if (managed === 0) return null;
  return {
    count: grouped.reduce((sum, g) => sum + g._count._all, 0),
    perCampaign: grouped.map((g) => ({ campaignId: g.campaignId, count: g._count._all })),
  };
}
