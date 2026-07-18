/**
 * Page publique téléchargement de photos.
 * Accessible via un lien MEDIA sans authentification.
 */
import { notFound } from "next/navigation";
import { validateMediaShareToken, resolveDownloadData } from "@/modules/media";
import DownloadView from "./DownloadView";

async function fetchDownloadData(token: string) {
  try {
    const shareToken = await validateMediaShareToken(token, ["MEDIA", "MEDIA_ALL"]);
    const data = await resolveDownloadData(shareToken);
    return {
      ...data,
      event: data.event ? { ...data.event, date: data.event.date.toISOString() } : null,
    };
  } catch {
    return null;
  }
}

export default async function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await fetchDownloadData(token);
  if (!data) notFound();
  return <DownloadView token={token} data={data} />;
}
