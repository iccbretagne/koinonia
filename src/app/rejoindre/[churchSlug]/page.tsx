import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { registry } from "@/lib/registry";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import PublicFormUnavailable from "@/components/PublicFormUnavailable";
import JoinForm from "./JoinForm";

export default async function RejoindrePublicPage({
  params,
}: {
  readonly params: Promise<{ churchSlug: string }>;
}) {
  const { churchSlug } = await params;

  const church = await prisma.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!church) return notFound();

  // Rendu dynamique : la clé Turnstile est lue dans l'environnement du serveur, pas au build.
  await connection();
  const turnstileSiteKey = getTurnstileSiteKey();

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <header className="bg-brand px-4 py-6">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-semibold text-on-brand/60 uppercase tracking-widest mb-1">
            {church.name}
          </p>
          <h1 className="text-xl font-bold text-on-brand">Rejoindre une famille</h1>
          <p className="text-sm text-on-brand/70 mt-1">
            Remplis ce formulaire pour rejoindre une famille près de chez toi.
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        {turnstileSiteKey ? (
          <JoinForm
            churchId={church.id}
            churchName={church.name}
            showPastoralCare={registry.has("care")}
            turnstileSiteKey={turnstileSiteKey}
          />
        ) : (
          <PublicFormUnavailable churchName={church.name} />
        )}
      </main>

      <footer className="text-center text-xs text-ink-subtle py-5 border-t border-line">
        <p>
          Pas sûr de quelle famille tu fais partie ?{" "}
          <a
            href={`${process.env.NEXT_PUBLIC_FAMILIES_URL ?? "https://familles.iccrennes.fr"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-text underline"
          >
            Trouve ta famille →
          </a>
        </p>
        <p className="mt-2 text-ink-subtle">Propulsé par <span className="font-medium text-ink-muted">Koinonia</span></p>
      </footer>
    </div>
  );
}
