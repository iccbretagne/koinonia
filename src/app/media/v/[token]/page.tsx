/**
 * Page publique de validation/pré-validation — photos (event) ou fichiers (projet).
 * Accessible via un lien VALIDATOR ou PREVALIDATOR sans authentification.
 */
import { notFound } from "next/navigation";
import { validateMediaShareToken, resolveValidatorData } from "@/modules/media";
import ValidatorView from "./ValidatorView";
import ProjectValidatorView from "./ProjectValidatorView";

export default async function ValidatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const data = await (async () => {
    try {
      const shareToken = await validateMediaShareToken(token, ["VALIDATOR", "PREVALIDATOR"]);
      return await resolveValidatorData(shareToken);
    } catch {
      return null;
    }
  })();

  if (!data) notFound();

  if (data.type === "project") {
    return <ProjectValidatorView token={token} data={data} />;
  }

  return (
    <ValidatorView
      token={token}
      data={{ token: data.token, event: { ...data.event, date: data.event.date.toISOString() }, photos: data.photos }}
    />
  );
}
