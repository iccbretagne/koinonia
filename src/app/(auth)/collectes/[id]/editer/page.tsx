import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { exportCampaignDefinition } from "@/modules/campaigns";
import { prisma } from "@/lib/prisma";
import { Alert } from "@/components/ui";
import PageHeader from "@/components/ui/PageHeader";
import CampaignEditor from "../../_components/editor/CampaignEditor";

type Props = { readonly params: Promise<{ id: string }> };

/** Édition graphique de la définition d'une campagne (spec 091, EVOL-11) : gestionnaire, sinon 404. */
export default async function EditCampaignPage({ params }: Props) {
  const { id } = await params;
  const managed = await requireCampaignManager(id).catch(() => null);
  if (!managed) notFound();
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { title: true, status: true } });
  if (!campaign) notFound();
  const { definition } = await exportCampaignDefinition(id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Link href={`/collectes/${id}`} className="hover:underline">{campaign.title}</Link>}
        title="Éditer la campagne"
        description="L'enregistrement passe par l'aperçu de l'import : une modification qui ferait perdre des réponses ou des fichiers est refusée."
      />
      <CampaignEditor
        initial={definition}
        campaignId={id}
        backHref={`/collectes/${id}`}
        notice={
          campaign.status !== "DRAFT" ? (
            <Alert tone="warning" title="Cette campagne n'est plus en brouillon.">
              Les répondants voient les modifications dès leur enregistrement.
            </Alert>
          ) : undefined
        }
      />
    </div>
  );
}
