import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import FreelanceProfileFormClient from "@/app/(auth)/jobs/freelance/profiles/new/FreelanceProfileFormClient";
import { paths } from "@/lib/paths";

export default async function EditFreelanceProfilePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const profile = await prisma.freelanceProfile.findUnique({ where: { id } });
  if (!profile) notFound();
  if (profile.authorId !== session.user.id) redirect(paths.jobs.freelanceProfile(id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Modifier mon profil freelance" />
      <FreelanceProfileFormClient
        initial={{
          ...profile,
          availableFrom: profile.availableFrom ? profile.availableFrom.toISOString() : null,
        }}
        defaultEmail={session.user.email ?? ""}
      />
    </div>
  );
}
