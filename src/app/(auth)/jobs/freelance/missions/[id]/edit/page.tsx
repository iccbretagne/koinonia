import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import MissionFormClient from "@/app/(auth)/jobs/freelance/missions/new/MissionFormClient";

export default async function EditMissionPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const mission = await prisma.freelanceMission.findUnique({ where: { id } });
  if (!mission) notFound();
  if (mission.authorId !== session.user.id) redirect(`/jobs/freelance/missions/${id}`);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Modifier la mission" />
      <MissionFormClient initial={mission} defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
