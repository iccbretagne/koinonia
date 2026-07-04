import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import SeekerFormClient from "../../new/SeekerFormClient";

export default async function EditSeekerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const seeker = await prisma.jobSeeker.findUnique({ where: { id } });

  if (!seeker) notFound();
  if (seeker.authorId !== session.user.id) redirect(`/jobs/seekers/${id}`);
  if (seeker.status !== "ACTIVE") redirect(`/jobs/seekers/${id}`);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link href={`/jobs/seekers/${id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← Retour
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier le profil</h1>
      <SeekerFormClient
        initial={{
          id:             seeker.id,
          title:          seeker.title,
          wantEmploi:     seeker.wantEmploi,
          wantStage:      seeker.wantStage,
          wantAlternance: seeker.wantAlternance,
          sector:         seeker.sector,
          location:       seeker.location,
          remote:         seeker.remote,
          availableFrom:  seeker.availableFrom ? seeker.availableFrom.toISOString() : null,
          description:    seeker.description,
          contactEmail:   seeker.contactEmail,
          contactUrl:     seeker.contactUrl,
        }}
        defaultEmail={session.user.email ?? null}
      />
    </div>
  );
}
