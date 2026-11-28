import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, buttonClasses } from "@/components/ui";
import SeekerFormClient from "../../nouveau/SeekerFormClient";
import { paths } from "@/lib/paths";

export default async function EditSeekerPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const seeker = await prisma.jobSeeker.findUnique({ where: { id } });

  if (!seeker) notFound();
  if (seeker.authorId !== session.user.id) redirect(paths.jobs.seeker(id));
  if (seeker.status !== "ACTIVE") redirect(paths.jobs.seeker(id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href={paths.jobs.seeker(id)} className={`${buttonClasses("ghost", "sm")} self-start`}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Retour au profil
      </Link>
      <PageHeader title="Modifier le profil" />
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
