import type { Metadata } from "next";
import { connection } from "next/server";
import PublicShell from "@/components/ticketing/PublicShell";
import InterviewManager from "@/components/serving/InterviewManager";
import { Alert } from "@/components/ui";
import { findApplicationIdByToken, publicInterviewView } from "@/modules/serving";

type Params = { readonly params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Mon entretien", robots: { index: false, follow: false } };

/** Rendez-vous d'entretien du candidat (spec 082) : lien reçu après l'envoi de la fiche, sans compte. */
export default async function InterviewPage({ params }: Params) {
  const { token } = await params;
  await connection();
  const found = await findApplicationIdByToken(token);
  const view = found ? await publicInterviewView(found.id) : null;
  if (!view) {
    return (
      <PublicShell eyebrow="Koinonia" title="Lien introuvable">
        <Alert tone="info" title="Ce lien ne mène à aucun rendez-vous." />
      </PublicShell>
    );
  }
  return (
    <PublicShell eyebrow={view.church.name} title={`Bonjour ${view.firstName}`}>
      <InterviewManager token={token} />
    </PublicShell>
  );
}
