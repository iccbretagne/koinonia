import type { Metadata } from "next";
import { connection } from "next/server";
import PublicShell from "@/components/ticketing/PublicShell";
import { Alert } from "@/components/ui";
import { acceptsResponses, answersRecord, findResponseByToken, publicView } from "@/modules/forms";
import ManageResponse from "./ManageResponse";

type Params = { readonly params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Ma réponse", robots: { index: false } };

/** « Gérer ma réponse » (spec 079) : lien reçu par email, sans compte. */
export default async function ManageResponsePage({ params }: Params) {
  const { token } = await params;
  await connection();
  const response = await findResponseByToken(token);
  if (!response) {
    return (
      <PublicShell eyebrow="Koinonia" title="Lien introuvable">
        <Alert tone="info" title="Ce lien ne mène à aucune réponse." />
      </PublicShell>
    );
  }
  const view = await publicView(response.form);
  const open = ["CONFIRMED", "WAITLISTED", "OFFERED"].includes(response.status);
  return (
    <PublicShell eyebrow={response.form.church.name} title={response.form.title}>
      <ManageResponse
        token={token}
        form={JSON.parse(JSON.stringify(view))}
        status={response.status}
        answers={answersRecord(response.answers) as Record<string, unknown>}
        editable={open && acceptsResponses(response.form)}
        offerExpiresAt={response.offerExpiresAt?.toISOString() ?? null}
      />
    </PublicShell>
  );
}
