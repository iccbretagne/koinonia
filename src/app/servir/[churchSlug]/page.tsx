import type { Metadata } from "next";
import { connection } from "next/server";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import PublicFormUnavailable from "@/components/PublicFormUnavailable";
import { getServingDurations, resolvePublicChurch } from "@/modules/serving";
import ServingForm from "./ServingForm";

export const metadata: Metadata = {
  title: "Servir — candidature",
  robots: { index: false, follow: false },
};

/**
 * Formulaire public de candidature au service (spec 073). Église inconnue ou sans département
 * Vie des STAR : « formulaire non disponible », sans distinguer les deux cas.
 */
export default async function ServirPublicPage({ params }: { readonly params: Promise<{ churchSlug: string }> }) {
  const { churchSlug } = await params;
  // Rendu dynamique : la clé Turnstile est lue dans l'environnement du serveur, pas au build.
  await connection();
  const church = await resolvePublicChurch(churchSlug);
  const turnstileSiteKey = getTurnstileSiteKey();
  const retentionMonths = church ? (await getServingDurations(church.id)).retentionMonths : 0;

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <header className="bg-brand px-4 py-6">
        <div className="max-w-xl mx-auto">
          {church && (
            <p className="text-xs font-semibold text-on-brand/60 uppercase tracking-widest mb-1">{church.name}</p>
          )}
          <h1 className="text-xl font-bold text-on-brand">Servir dans l&apos;église</h1>
          <p className="text-sm text-on-brand/70 mt-1">
            Remplis cette fiche pour proposer ta candidature au service. L&apos;équipe Vie des STAR
            l&apos;étudiera avec toi.
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        {church && turnstileSiteKey ? (
          <ServingForm
            churchSlug={churchSlug}
            churchName={church.name}
            retentionMonths={retentionMonths}
            turnstileSiteKey={turnstileSiteKey}
          />
        ) : (
          <PublicFormUnavailable churchName={church?.name ?? "l'église"} />
        )}
      </main>

      <footer className="text-center text-xs text-ink-subtle py-5 border-t border-line">
        <p>
          Propulsé par <span className="font-medium text-ink-muted">Koinonia</span>
        </p>
      </footer>
    </div>
  );
}
