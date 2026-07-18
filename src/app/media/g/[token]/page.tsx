/**
 * Page publique galerie photos.
 * Accessible via un lien GALLERY sans authentification.
 */
import { notFound } from "next/navigation";
import { validateMediaShareToken, resolveGalleryData } from "@/modules/media";
import GalleryView from "./GalleryView";

async function fetchGalleryData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, "GALLERY");
    const data = await resolveGalleryData(shareToken);
    return {
      ...data,
      event: data.event ? { ...data.event, date: data.event.date.toISOString() } : null,
    };
  } catch {
    return null;
  }
}

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchGalleryData(token);
  if (!data) notFound();
  return <GalleryView data={data} />;
}
