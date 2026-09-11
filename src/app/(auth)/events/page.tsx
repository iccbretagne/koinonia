import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CalendarClient from "./CalendarClient";

export default async function ChurchAgendaPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const currentChurchId = await getCurrentChurchId(session);
  if (!currentChurchId) {
    return (
      <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
        Vous n&apos;êtes assigné à aucune église.
      </div>
    );
  }

  const events = await prisma.event.findMany({
    where: { churchId: currentChurchId },
    orderBy: { date: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda de l&apos;église</h1>
        <p className="text-sm text-gray-500 mt-1">
          Calendrier, multi-mois ou liste — au choix.
        </p>
      </div>
      <CalendarClient
        events={events.map((e) => ({
          ...e,
          date: e.date.toISOString(),
        }))}
      />
    </div>
  );
}
