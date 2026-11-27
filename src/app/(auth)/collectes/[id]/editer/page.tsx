import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCampaignManager } from "@/modules/campaigns/auth";
import { exportCampaignDefinition } from "@/modules/campaigns";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import { Alert } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
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
  // Définition stockée illisible (questionnaire ou règle hors du format actuel) : l'éditeur ne
  // peut pas la reconstruire ; un import JSON complet la remplace, avec son aperçu.
  const exported = await exportCampaignDefinition(id).catch((error: unknown) => {
    if (error instanceof ApiError) return null;
    throw error;
  });
  const header = (
    <PageHeader
      eyebrow={<Link href={`/collectes/${id}`} className="hover:underline">{campaign.title}</Link>}
      title="Éditer la campagne"
      description="L'enregistrement passe par l'aperçu de l'import : une modification qui ferait perdre des réponses ou des fichiers est refusée."
    />
  );
  if (!exported) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert tone="danger" title="Définition illisible par l'éditeur.">
          La définition enregistrée de cette campagne ne peut pas être reconstruite pour l&apos;édition graphique. Importez une
          définition JSON complète : son aperçu indiquera ce qui change avant tout enregistrement.
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/collectes/${id}/import`} className={buttonClasses("primary")}>
            Importer une définition JSON
          </Link>
          <Link href={`/collectes/${id}`} className={buttonClasses("secondary")}>
            Retour à la campagne
          </Link>
        </div>
      </div>
    );
  }
  const { definition } = exported;
  return (
    <div className="flex flex-col gap-6">
      {header}
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
