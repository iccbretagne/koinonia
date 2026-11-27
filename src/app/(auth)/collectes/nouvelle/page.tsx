import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { hasCampaignsManage } from "@/modules/campaigns/auth";
import PageHeader from "@/components/ui/PageHeader";
import CampaignEditor from "../_components/editor/CampaignEditor";
import { blankDefinition } from "../_components/editor/state";

/** Création d'une campagne avec l'éditeur graphique (spec 091, EVOL-11) : `campaigns:manage` dans l'église courante. */
export default async function NewCampaignPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId || !(await hasCampaignsManage(session, churchId))) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Link href="/collectes" className="hover:underline">Collectes</Link>}
        title="Nouvelle campagne"
        description="Composez les questionnaires, leurs destinataires et les contrôles. La campagne reste en brouillon jusqu'à son ouverture."
      />
      <CampaignEditor initial={blankDefinition()} backHref="/collectes" />
    </div>
  );
}
