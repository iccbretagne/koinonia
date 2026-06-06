import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import JoinForm from "./JoinForm";

export default async function RejoindrePublicPage({
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-icc-violet px-4 py-6">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-1">
            {church.name}
          </p>
          <h1 className="text-xl font-bold text-white">Rejoindre une famille</h1>
          <p className="text-sm text-white/70 mt-1">
            Remplis ce formulaire pour rejoindre une famille près de chez toi.
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
        <JoinForm churchId={church.id} churchName={church.name} />
      </main>

      <footer className="text-center text-xs text-gray-400 py-5 border-t border-gray-200">
        <p>
          Pas sûr de quelle famille tu fais partie ?{" "}
          <a
            href={`${process.env.NEXT_PUBLIC_FAMILIES_URL ?? "https://familles.iccrennes.fr"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-icc-violet underline"
          >
            Trouve ta famille →
          </a>
        </p>
        <p className="mt-2 text-gray-400">Propulsé par <span className="font-medium text-gray-500">Koinonia</span></p>
      </footer>
    </div>
  );
}
