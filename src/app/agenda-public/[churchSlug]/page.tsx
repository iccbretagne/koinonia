import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PublicRequestForm from "./PublicRequestForm";

export default async function PublicAgendaRequestPage({
  params,
}: {
  params: Promise<{ churchSlug: string }>;
}) {
  const { churchSlug } = await params;

  const church = await prisma.church.findUnique({
    where: { slug: churchSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!church) return notFound();

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">{church.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Demande de rendez-vous pastoral</p>
        </div>
      </header>
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        <PublicRequestForm churchSlug={church.slug} churchName={church.name} turnstileSiteKey={siteKey} />
      </main>
      <footer className="text-center text-xs text-gray-400 py-4">
        Propulsé par Koinonia
      </footer>
    </div>
  );
}
