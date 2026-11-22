import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { ticketingSitesEnabled } from "@/lib/ticketing-sites-flag";
import { PageHeader } from "@/components/ui";
import { canDo, getEventAccess, getEventDetail, getSite, listAssets } from "@/modules/ticketing";
import SiteImagesUploader from "./SiteImagesUploader";

/** Images du site d'un événement (spec 087) : dépôt de plusieurs images d'un coup, rôle `site`. */
export default async function SiteImagesPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const access = await getEventAccess(session, id).catch(() => null);
  if (!access || !canDo(access, "site") || !ticketingSitesEnabled()) notFound();
  const [event, site] = await Promise.all([getEventDetail(id), getSite(id)]);
  const assets = await listAssets(site.id);
  return (
    <div className="space-y-4">
      <PageHeader title="Images du site" description={event.title} />
      <SiteImagesUploader eventId={id} assets={assets} />
    </div>
  );
}
