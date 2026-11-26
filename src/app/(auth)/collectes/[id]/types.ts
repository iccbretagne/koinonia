import type { getCampaignOverview } from "@/modules/campaigns";
import type { Jsonify } from "../_components/display";

/** Onglets du pilotage (`?onglet=`) et données passées au client. Pur : importable par la page serveur. */
export const CAMPAIGN_TABS = ["suivi", "controles", "repondants", "gestionnaires", "parametres", "export"] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];
export type CampaignOverviewData = Jsonify<Awaited<ReturnType<typeof getCampaignOverview>>>;
export type CampaignFormData = CampaignOverviewData["forms"][number];
export type AssignmentData = CampaignFormData["assignments"][number];
