import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { appIconUrl, getAppIconVersion } from "@/modules/core";
import InstallGuide from "@/components/install/InstallGuide";

export const metadata: Metadata = {
  title: "Installer Koinonia",
  description: "Ajoutez Koinonia à l'écran d'accueil de votre téléphone ou à votre ordinateur, en une minute.",
};

/**
 * Installer Koinonia sur son appareil (spec 070). Page publique, partageable avant la première
 * connexion : elle ne lit que la session (facultative) et la version de l'icône, aucune donnée
 * d'église ni de personne.
 */
export default async function InstallPage() {
  const [session, iconVersion] = await Promise.all([auth(), getAppIconVersion()]);
  const signedIn = Boolean(session?.user);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône servie par /api/app-icon (spec 069) */}
        <img
          src={appIconUrl("icon-192", iconVersion)}
          alt=""
          width={64}
          height={64}
          className="size-16 shrink-0 rounded-[22%] shadow-card"
        />
        <div>
          <h1 className="font-display text-[22px] font-bold leading-7 text-ink md:text-[28px] md:leading-[34px]">
            Installer Koinonia
          </h1>
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Une icône sur votre écran d&apos;accueil, l&apos;application en plein écran et les notifications.
          </p>
        </div>
      </header>

      <InstallGuide signedIn={signedIn} />

      <p className="text-center text-[15px]">
        <Link href="/" className="font-semibold text-brand-text underline">
          {signedIn ? "Retour à Koinonia" : "Se connecter"}
        </Link>
      </p>
    </main>
  );
}
