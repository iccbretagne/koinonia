import { renderPublicationRoute } from "../../../publication-route";

export default async function MissionDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderPublicationRoute("MISSION", id);
}
