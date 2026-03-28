import { auth, getCurrentChurchId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import EventSelector from "@/components/EventSelector";
import PlanningGrid from "@/components/PlanningGrid";
import DashboardActions from "@/components/DashboardActions";
import MonthlyPlanningView from "@/components/MonthlyPlanningView";
import DepartmentTasksView from "@/components/DepartmentTasksView";
import WeeklyPlanningView from "@/components/WeeklyPlanningView";

interface DashboardProps {
  searchParams: Promise<{ dept?: string; event?: string; view?: string; tour?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const {
    dept: selectedDeptId,
    event: selectedEventId,
    view = "event",
    tour,
  } = await searchParams;

  const currentChurchId = await getCurrentChurchId(session);
  const userPermissions = new Set(
    session.user.churchRoles.flatMap((r) => hasPermission(r.role))
  );
  const canEditPlanning = userPermissions.has("planning:edit");

  // Auto-trigger guided tour on first visit with a role
  const shouldTriggerTour =
    !session.user.hasSeenTour &&
    !tour &&
    session.user.churchRoles.length > 0;

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
      const qs = new URLSearchParams({ dept: firstDeptId });
      if (view !== "event") qs.set("view", view);
      if (tour) qs.set("tour", tour);
      if (shouldTriggerTour) qs.set("tour", "1");
      redirect(`/dashboard?${qs.toString()}`);
    }
  }

  // If dept is already selected but tour hasn't been seen, redirect with tour=1
  if (shouldTriggerTour && selectedDeptId) {
    const qs = new URLSearchParams();
    qs.set("dept", selectedDeptId);
    if (selectedEventId) qs.set("event", selectedEventId);
    if (view !== "event") qs.set("view", view);
    qs.set("tour", "1");
    redirect(`/dashboard?${qs.toString()}`);
  }

  // Get church name for the current church
  const currentChurchRole = session.user.churchRoles.find(
    (r) => r.churchId === currentChurchId
  );
  const churchName = currentChurchRole
    ? (await prisma.church.findUnique({
        where: { id: currentChurchId },
        select: { name: true },
      }))?.name ?? undefined
    : undefined;

  // Fetch department name (for month, tasks and week views)
  const selectedDepartment =
    (view === "month" || view === "tasks" || view === "week") && selectedDeptId
      ? await prisma.department.findUnique({
          where: { id: selectedDeptId },
          select: { name: true },
        })
      : null;

  // Fetch events for the selected department (needed for event view)
  const events =
    view === "event"
      ? await prisma.event.findMany({
          where: {
            churchId: currentChurchId,
            ...(selectedDeptId
              ? { eventDepts: { some: { departmentId: selectedDeptId } } }
              : {}),
          },
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

      {view === "week" ? (
        selectedDeptId ? (
          <WeeklyPlanningView
            churchId={currentChurchId}
            departmentId={selectedDeptId}
            departmentName={selectedDepartment?.name}
            churchName={churchName}
            canEdit={canEditPlanning}
          />
        ) : (
          <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
            Sélectionnez un département dans la barre latérale
          </div>
        )
      ) : view === "tasks" ? (
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
          <MonthlyPlanningView departmentId={selectedDeptId} departmentName={selectedDepartment?.name} churchName={churchName} />
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
