/**
 * Page publique galerie photos.
 * Accessible via un lien GALLERY sans authentification.
 */
import { notFound } from "next/navigation";
import GalleryView from "./GalleryView";

async function fetchGalleryData(token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/media/gallery/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchGalleryData(token);

  if (!data) notFound();

  return <GalleryView data={data} />;
}
