import { renderPublicationRoute } from "../../../publication-route";

export default async function FreelanceProfileDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderPublicationRoute("FREELANCE", id);
}
