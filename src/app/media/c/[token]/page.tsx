/**
 * Page publique collection multi-sources.
 * Accessible via un lien COLLECTION sans authentification.
 */
import { notFound } from "next/navigation";
import { validateMediaShareToken, resolveCollectionData } from "@/modules/media";
import CollectionView from "./CollectionView";

async function fetchCollectionData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, "COLLECTION");
    return await resolveCollectionData(shareToken);
  } catch {
    return null;
  }
}

export default async function CollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchCollectionData(token);
  if (!data) notFound();
  return <CollectionView token={token} data={data} />;
}
