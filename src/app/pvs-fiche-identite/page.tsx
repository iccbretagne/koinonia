import type { Metadata } from "next";
import { connection } from "next/server";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import PublicFormUnavailable from "@/components/PublicFormUnavailable";
import FicheForm from "./FicheForm";
 import Image from "next/image";
export const metadata: Metadata = { title: "Fiche d'identité" };

const DEP_NAME = "Pôle Vie Des S.T.A.R";  
const CHURCH_NAME = "ICC RENNES"

export default async function FicheIdentitePage() {
  // Rendu dynamique : la clé Turnstile est lue dans l'environnement du serveur, pas au build.
  await connection();
  const turnstileSiteKey = getTurnstileSiteKey();

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
     
 

      <header className="bg-brand px-4 py-6">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <Image
            src="/brand/icc-rennes-logo-blanc.svg"
            alt={`Logo ${CHURCH_NAME}`}
            width={56}
            height={56}
            priority
            className="h-14 w-14 shrink-0 rounded-xl object-contain"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-brand/60 uppercase tracking-widest mb-1">
              {DEP_NAME}
            </p>
            <h1 className="text-xl font-bold text-on-brand">Fiche d&apos;identité</h1>
            <p className="text-sm text-on-brand/70 mt-1">
              Fiche à remplir pour les aspirants au service dans l&apos;Eglise.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        {turnstileSiteKey ? (
          <FicheForm turnstileSiteKey={turnstileSiteKey} />
        ) : (
          <PublicFormUnavailable churchName={CHURCH_NAME} />
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