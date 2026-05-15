import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaView } from "@/modules/agenda";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

import ProfileAgenda from "./ProfileAgenda";

function getWeekBounds(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export default async function ProfileAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const { profileId } = await params;
  const { week } = await searchParams;

  const profile = await prisma.pastoralProfile.findUnique({
    where: { id: profileId },
    select: { id: true, name: true, role: true, churchId: true, userId: true },
  });

  if (!profile || profile.churchId !== churchId) return notFound();

  // Accès : agenda:view (rôle) OU Protocole OU profil lié au compte
  const isOwnProfile = profile.userId === session.user.id;
  if (!isOwnProfile) {
    try {
      await requireAgendaView(churchId);
    } catch {
      return notFound();
    }
  }

  const refDate = week ? new Date(week) : new Date();
  const { from, to } = getWeekBounds(refDate);

  const entries = await prisma.agendaEntry.findMany({
    where: { recipientId: profileId, startsAt: { gte: from, lt: to } },
    include: {
      request: { select: { id: true, firstName: true, lastName: true, qualificationNote: true } },
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Agenda — {profile.name}
      </h1>
      <p className="text-sm text-gray-500 mb-6">{ROLE_LABELS[profile.role]}</p>
      <ProfileAgenda profile={profile} entries={entries} weekStart={from.toISOString()} />
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistante Pasteur",
  BERGER: "Berger",
};
