import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { getCampaignOverview, storedItems } from "@/modules/campaigns";
import type { Jsonify } from "../_components/display";
import CampaignView from "./CampaignView";
import { CAMPAIGN_TABS, type CampaignOverviewData, type CampaignTab } from "./types";

type Props = {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ onglet?: string }>;
};

/** Questionnaire de chaque code (contrôles croisés : questionnaires concernés). */
async function formTitlesByCode(campaignId: string): Promise<Record<string, string>> {
  const forms = await prisma.campaignForm.findMany({ where: { campaignId }, select: { title: true, definition: true } });
  const out: Record<string, string> = {};
  for (const f of forms) for (const item of storedItems(f.definition)) out[item.code] = f.title;
  return out;
}

/**
 * Pilotage d'une campagne de collecte (spec 090) : suivi, contrôles, répondants, gestionnaires,
 * paramètres, export. Gestionnaire de la campagne seulement ; tout autre compte (ou autre église)
 * reçoit un 404.
 */
export default async function CampaignPage({ params, searchParams }: Props) {
  const { id } = await params;
  const managed = await requireCampaignManager(id).catch(() => null);
  if (!managed) notFound();
  const { onglet } = await searchParams;
  const tab: CampaignTab = CAMPAIGN_TABS.find((t) => t === onglet) ?? "suivi";
  const [overview, codeForms] = await Promise.all([
    getCampaignOverview(id),
    tab === "controles" ? formTitlesByCode(id) : Promise.resolve({} as Record<string, string>),
  ]);
  const data = JSON.parse(JSON.stringify(overview)) as Jsonify<typeof overview> as CampaignOverviewData;
  return <CampaignView tab={tab} overview={data} codeForms={codeForms} />;
}
