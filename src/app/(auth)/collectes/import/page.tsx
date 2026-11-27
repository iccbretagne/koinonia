import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { hasCampaignsManage } from "@/modules/campaigns/auth";
import PageHeader from "@/components/ui/PageHeader";
import ImportCampaign from "../_components/ImportCampaign";

/** Création d'une campagne par import de sa définition (spec 090) : `campaigns:manage` dans l'église courante. */
export default async function ImportCampaignPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId || !(await hasCampaignsManage(session, churchId))) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Link href="/collectes" className="hover:underline">Collectes</Link>}
        title="Importer une campagne"
        description="Collez ou choisissez la définition JSON, vérifiez l'aperçu, puis créez la campagne. Elle reste en brouillon jusqu'à son ouverture."
      />
      <ImportCampaign />
    </div>
  );
}
