import { notFound } from "next/navigation";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import ImportCampaign from "../../_components/ImportCampaign";

type Props = { readonly params: Promise<{ id: string }> };

/** Mise à jour de la définition d'une campagne existante (spec 090) : gestionnaire, sinon 404. */
export default async function ReimportCampaignPage({ params }: Props) {
  const { id } = await params;
  const managed = await requireCampaignManager(id).catch(() => null);
  if (!managed) notFound();
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { key: true, title: true } });
  if (!campaign) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={campaign.title}
        title="Mettre à jour la définition"
        description="Les questionnaires, destinataires et répondants sont rapprochés par leur clé : rien n'est dupliqué. Une modification qui ferait perdre des réponses est refusée. L'état de la campagne ne change pas."
      />
      <ImportCampaign expectedKey={campaign.key} campaignId={id} />
    </div>
  );
}
