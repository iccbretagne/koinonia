import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import MissionFormClient from "@/app/(auth)/jobs/freelance/missions/new/MissionFormClient";

export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;

  const mission = await prisma.freelanceMission.findUnique({ where: { id } });
  if (!mission) notFound();
  if (mission.authorId !== session.user.id) redirect(`/jobs/freelance/missions/${id}`);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modifier la mission</h1>
      <MissionFormClient initial={mission} defaultEmail={session.user.email ?? ""} />
    </div>
  );
}
