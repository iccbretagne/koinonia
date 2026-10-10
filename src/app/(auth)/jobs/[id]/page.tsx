import { renderPublicationRoute } from "../publication-route";

export default async function JobDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderPublicationRoute("OFFER", id);
}
