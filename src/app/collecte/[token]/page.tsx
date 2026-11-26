import type { Metadata } from "next";
import { connection } from "next/server";
import PublicShell from "@/components/ticketing/PublicShell";
import { Alert } from "@/components/ui";
import { requireTokenAccess } from "@/modules/campaigns/auth";
import { getAssignmentView } from "@/modules/campaigns";
import AssignmentForm, { type AssignmentViewData } from "@/components/campaigns/AssignmentForm";

type Params = { readonly params: Promise<{ token: string }> };

/** Le jeton est dans l'adresse : jamais indexé, jamais transmis aux sites liés. */
export const metadata: Metadata = {
  title: "Questionnaire de collecte",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Questionnaire par lien personnel (spec 090), sans compte ni cookie. Lien inconnu, régénéré,
 * retiré ou campagne non ouverte : le même message neutre.
 */
export default async function PublicAssignmentPage({ params }: Params) {
  const { token } = await params;
  await connection();
  const access = await requireTokenAccess(token).catch(() => null);
  if (!access) {
    return (
      <PublicShell eyebrow="Koinonia" title="Lien invalide ou expiré">
        <Alert tone="info" title="Ce lien ne mène à aucun questionnaire ouvert.">
          Il a peut-être été remplacé par un nouveau lien, ou la collecte est terminée. Contactez la personne qui vous l&apos;a envoyé.
        </Alert>
      </PublicShell>
    );
  }
  const view = await getAssignmentView(access);

  return (
    <div className="min-h-screen bg-bg">
      <div className="bg-brand px-4 py-3">
        <p className="mx-auto max-w-3xl text-xs font-semibold uppercase tracking-widest text-on-brand/80">Koinonia · Collecte</p>
      </div>
      <main className="px-4 py-6">
        <AssignmentForm
          view={JSON.parse(JSON.stringify(view)) as AssignmentViewData}
          apiBase={`/api/campaigns/public/${encodeURIComponent(token)}`}
        />
      </main>
    </div>
  );
}
