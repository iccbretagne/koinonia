import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicGivingPage } from "@/modules/giving";
import GivingPageView from "../_components/GivingPageView";
import GivingPageHeader from "../_components/GivingPageHeader";

type Params = { readonly params: Promise<{ churchSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { churchSlug } = await params;
  const page = await getPublicGivingPage(churchSlug);
  return { title: page ? `Donner — ${page.churchName}` : "Page non disponible" };
}

/**
 * Page publique « Donner » d'une église (spec 065), sans connexion. Église inconnue, page jamais
 * configurée ou désactivée : même réponse, pour ne rien révéler.
 */
export default async function GivingPublicPage({ params }: Params) {
  const { churchSlug } = await params;
  const page = await getPublicGivingPage(churchSlug);
  if (!page) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken">
      <header className="bg-brand px-4 py-6">
        <div className="mx-auto max-w-xl">
          <GivingPageHeader churchName={page.churchName} nameSize={page.churchNameSize} logoSrc={page.logo?.src ?? null} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <GivingPageView page={page} />
      </main>
      <footer className="py-4 text-center text-xs text-ink-subtle">
        Propulsé par <span className="font-medium text-ink-muted">Koinonia</span>
      </footer>
    </div>
  );
}
