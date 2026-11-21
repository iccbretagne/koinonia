import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { publicSiteView } from "@/modules/ticketing";
import SiteRenderer from "../../_components/SiteRenderer";

type Params = { readonly params: Promise<{ siteSlug: string; page?: string[] }> };

const assetUrl = (id: string) => `/api/ticketing/public/site-assets/${id}`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { siteSlug } = await params;
  const view = await publicSiteView(siteSlug);
  return view ? { title: view.title } : { title: "Événement" };
}

/** Site public d'un événement (spec 084), servi sur son hôte ; le proxy y réécrit `/` et `/<page>`. */
export default async function SitePage({ params }: Params) {
  await connection();
  const { siteSlug, page } = await params;
  if (page && page.length > 1) notFound();
  const view = await publicSiteView(siteSlug);
  if (!view) notFound();
  const pageSlug = page?.[0];
  if (pageSlug && !view.document.pages.some((p) => p.slug === pageSlug)) notFound();
  const first = view.document.pages[0].slug;
  return (
    <SiteRenderer
      document={view.document}
      event={view.event}
      title={view.title}
      churchSlug={view.churchSlug}
      eventSlug={view.eventSlug}
      ended={view.ended}
      pageSlug={pageSlug}
      assetUrl={assetUrl}
      pageHref={(slug) => (slug === first ? "/" : `/${slug}`)}
      fullHeight
    />
  );
}
