import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import FreelanceProfileFormClient from "@/app/(auth)/jobs/freelance/profiles/new/FreelanceProfileFormClient";

export default async function EditFreelanceProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const profile = await prisma.freelanceProfile.findUnique({ where: { id } });
  if (!profile) notFound();
  if (profile.authorId !== session.user.id) redirect(`/jobs/freelance/profiles/${id}`);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier mon profil freelance</h1>
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
