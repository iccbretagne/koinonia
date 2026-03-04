import { auth, getCurrentChurchId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import EventSelector from "@/components/EventSelector";
import PlanningGrid from "@/components/PlanningGrid";
import DashboardActions from "@/components/DashboardActions";
import MonthlyPlanningView from "@/components/MonthlyPlanningView";
import DepartmentTasksView from "@/components/DepartmentTasksView";

interface DashboardProps {
  searchParams: Promise<{ dept?: string; event?: string; view?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const {
    dept: selectedDeptId,
    event: selectedEventId,
    view = "event",
  } = await searchParams;

  const currentChurchId = await getCurrentChurchId(session);
  const userPermissions = new Set(
    session.user.churchRoles.flatMap((r) => hasPermission(r.role))
  );
  const canEditPlanning = userPermissions.has("planning:edit");

  if (!currentChurchId) {
    return (
      <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
        Vous n&apos;êtes assigné à aucune église.
      </div>
    );
  }

  // Auto-select first department when none is specified
  if (!selectedDeptId) {
    const isAdmin = session.user.churchRoles.some(
      (r) =>
        r.churchId === currentChurchId &&
        (r.role === "SUPER_ADMIN" || r.role === "ADMIN" || r.role === "SECRETARY")
    );

    let firstDeptId: string | undefined;
    if (isAdmin) {
      const firstDept = await prisma.department.findFirst({
        where: { ministry: { churchId: currentChurchId } },
        orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
        select: { id: true },
      });
      firstDeptId = firstDept?.id;
    } else {
      const userDepts = session.user.churchRoles
        .filter((r) => r.churchId === currentChurchId)
        .flatMap((r) => r.departments);
      firstDeptId = userDepts[0]?.department?.id;
    }

    if (firstDeptId) {
      redirect(`/dashboard?dept=${firstDeptId}${view !== "event" ? `&view=${view}` : ""}`);
    }
  }

  // Fetch department name (for month view and tasks view)
  const selectedDepartment =
    (view === "month" || view === "tasks") && selectedDeptId
      ? await prisma.department.findUnique({
          where: { id: selectedDeptId },
          select: { name: true },
        })
      : null;

  // Fetch events for the church (needed for event view)
  const events =
    view === "event"
      ? await prisma.event.findMany({
          where: { churchId: currentChurchId },
          orderBy: { date: "asc" },
          include: {
            eventDepts: {
              include: { department: true },
            },
          },
        })
      : [];

  return (
    <div>
      <div className="mb-4 md:mb-6">
        <DashboardActions />
      </div>

      {view === "event" && (
        <div className="mb-4 md:mb-6">
          <EventSelector
            events={events.map((e) => ({
              id: e.id,
              title: e.title,
              type: e.type,
              date: e.date.toISOString(),
            }))}
            selectedEventId={selectedEventId || null}
            selectedDeptId={selectedDeptId || null}
          />
        </div>
      )}

      {view === "tasks" ? (
        selectedDeptId ? (
          <DepartmentTasksView
            departmentId={selectedDeptId}
            departmentName={selectedDepartment?.name}
            readOnly={!canEditPlanning}
          />
        ) : (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
            Sélectionnez un département dans la barre latérale
          </div>
        )
      ) : view === "month" ? (
        selectedDeptId ? (
          <MonthlyPlanningView departmentId={selectedDeptId} departmentName={selectedDepartment?.name} />
        ) : (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
            Sélectionnez un département dans la barre latérale
          </div>
        )
      ) : selectedEventId && selectedDeptId ? (
        <PlanningGrid eventId={selectedEventId} departmentId={selectedDeptId} readOnly={!canEditPlanning} />
      ) : (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          {!selectedDeptId
            ? "Sélectionnez un département dans la barre latérale"
            : "Sélectionnez un événement ci-dessus"}
        </div>
      )}
    </div>
  );
}
