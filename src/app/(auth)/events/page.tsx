import { auth, getCurrentChurchId } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
// Depuis `button-classes` et non `Button` : ce dernier porte "use client", et cette page est
// rendue côté serveur.
import { buttonClasses } from "@/components/ui/button-classes";
import CalendarClient from "./CalendarClient";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { Church, Settings2 } from "lucide-react";

export default async function ChurchAgendaPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const currentChurchId = await getCurrentChurchId(session);
  if (!currentChurchId) {
    return (
      <EmptyState
        icon={Church}
        title="Aucune église"
        description="Vous n'êtes rattaché à aucune église. Contactez un administrateur."
      />
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agenda de l'église"
        description="Calendrier, plusieurs mois ou liste, au choix."
        actions={
          canManageEvents ? (
            <Link href="/admin/events" className={buttonClasses("secondary")}>
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Gérer les événements
            </Link>
          ) : undefined
        }
      />
      <CalendarClient
        events={events.map((e) => ({
          ...e,
          date: e.date.toISOString(),
        }))}
      />
    </div>
  );
}
