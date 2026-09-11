import { auth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
// Depuis `button-classes` et non `Button` : ce dernier porte "use client", et cette page est
// rendue côté serveur.
import { buttonClasses } from "@/components/ui/button-classes";
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

  // Raccourci vers la création/gestion des événements — jusqu'ici uniquement dans le menu
  // latéral, peu visible depuis l'agenda lui-même (Secrétariat, Admin, Super Admin).
  const userPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === currentChurchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canManageEvents = session.user.isSuperAdmin || userPermissions.has("events:manage");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de l&apos;église</h1>
          <p className="text-sm text-gray-500 mt-1">
            Calendrier, multi-mois ou liste — au choix.
          </p>
        </div>
        {canManageEvents && (
          <Link href="/admin/events" className={buttonClasses("primary")}>
            Gérer les événements
          </Link>
        )}
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
