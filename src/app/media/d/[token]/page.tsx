/**
 * Page publique téléchargement de photos.
 * Accessible via un lien MEDIA sans authentification.
 */
import { notFound } from "next/navigation";
import DownloadView from "./DownloadView";

async function fetchDownloadData(token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/media/download/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchDownloadData(token);

  if (!data) notFound();

  return <DownloadView token={token} data={data} />;
}
