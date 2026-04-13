/**
 * Page publique de validation/pré-validation de photos.
 * Accessible via un lien VALIDATOR ou PREVALIDATOR sans authentification.
 */
import { notFound } from "next/navigation";
import ValidatorView from "./ValidatorView";

async function fetchValidationData(token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/media/validate/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export default async function ValidatorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchValidationData(token);

  if (!data) notFound();

  return <ValidatorView token={token} data={data} />;
}
