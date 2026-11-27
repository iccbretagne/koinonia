import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { hasCampaignsManage, isCampaignManager, isChurchMember, requireCampaignManager, userActor } from "@/modules/campaigns/auth";
import { findCampaignByKey, importCampaign } from "@/modules/campaigns";
import { importBodySchema } from "./contract";

/** Clé de la campagne, lue avant validation complète pour décider du droit requis. */
function peekKey(definition: unknown): string | null {
  const key = (definition as { campaign?: { key?: unknown } } | null)?.campaign?.key;
  return typeof key === "string" ? key : null;
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    requireRateLimit(request, { prefix: `campaigns:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    const { definition, dryRun, campaignId } = importBodySchema.parse(await request.json());
    const key = peekKey(definition);

    let churchId: string;
    let canCreate: boolean;
    if (campaignId) {
      // Mise à jour d'une campagne précise : son église fait foi, jamais l'église courante.
      const { campaign } = await requireCampaignManager(campaignId);
      if (key !== campaign.key) {
        throw new ApiError(400, `Cette définition porte la clé « ${key ?? "?"} », pas celle de cette campagne (« ${campaign.key} »)`);
      }
      churchId = campaign.churchId;
      // La campagne existe : l'import la met à jour, il n'en crée jamais une autre.
      canCreate = false;
    } else {
      const current = await getCurrentChurchId(session);
      if (!current || !isChurchMember(session, current)) throw new ApiError(400, "Aucune église sélectionnée");
      churchId = current;
      const existing = key ? await findCampaignByKey(churchId, key) : null;
      canCreate = await hasCampaignsManage(session, churchId);
      if (existing) {
        if (!(await isCampaignManager(session, existing))) throw new ApiError(404, "Campagne introuvable");
      } else if (!canCreate) {
        throw new ApiError(403, "Créer une campagne demande le droit de gérer les campagnes");
      }
    }

    const actor = userActor(session);
    const preview = await importCampaign({ churchId, definition, dryRun, actor: { userId: session.user.id, name: actor.name }, canCreate });
    return successResponse(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
