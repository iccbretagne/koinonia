import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PublicRequestForm from "./PublicRequestForm";

export default async function PublicAgendaRequestPage({
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

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      <header className="bg-brand px-4 py-5">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-semibold text-on-brand/60 uppercase tracking-widest mb-1">Koinonia</p>
          <h1 className="text-xl font-bold text-on-brand">{church.name}</h1>
          <p className="text-sm text-on-brand/70 mt-0.5">Demande de rendez-vous pastoral</p>
        </div>
      </header>
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        <PublicRequestForm churchSlug={church.slug} churchName={church.name} turnstileSiteKey={siteKey} />
      </main>
      <footer className="text-center text-xs text-ink-subtle py-4">
        Propulsé par <span className="font-medium text-ink-muted">Koinonia</span>
      </footer>
    </div>
  );
}
