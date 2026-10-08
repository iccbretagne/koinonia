import type { ReactNode } from "react";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { auth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { rolePermissions } from "@/lib/registry";
import { isPastoralView } from "@/lib/view-mode";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import EventSelector from "@/components/EventSelector";
import PlanningGrid from "@/components/PlanningGrid";
import DashboardActions from "@/components/DashboardActions";
import MonthlyPlanningView from "@/components/MonthlyPlanningView";
import DepartmentTasksView from "@/components/DepartmentTasksView";
import WeeklyPlanningView from "@/components/WeeklyPlanningView";
import TeamEventsView from "@/components/TeamEventsView";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { CalendarSearch, Church, LayoutGrid } from "lucide-react";

/** État vide commun : aucun département ou aucun événement sélectionné. */
function SelectPrompt({ needsDepartment }: { readonly needsDepartment: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <EmptyState
        icon={needsDepartment ? LayoutGrid : CalendarSearch}
        title={needsDepartment ? "Choisissez un département" : "Choisissez un événement"}
        description={
          needsDepartment
            ? "Sélectionnez un département dans le menu pour afficher son planning."
            : "Sélectionnez un mois et un événement ci-dessus pour saisir le planning."
        }
      />
    </div>
  );
}

const DEPARTMENT_VIEWS = new Set(["week", "tasks", "month", "team"]);

/** Département proposé par défaut : le premier de l'église pour l'administration, sinon le sien. */
async function defaultDepartmentId(session: Session, churchId: string) {
  const isAdmin = session.user.churchRoles.some(
    (r) =>
      r.churchId === churchId &&
      (r.role === "SUPER_ADMIN" || r.role === "ADMIN" || r.role === "SECRETARY")
  );
  if (isAdmin) {
    const firstDept = await prisma.department.findFirst({
      where: { ministry: { churchId } },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
      select: { id: true },
    });
    return firstDept?.id;
  }
  const userDepts = session.user.churchRoles
    .filter((r) => r.churchId === churchId)
    .flatMap((r) => r.departments);
  return userDepts[0]?.department?.id;
}

/**
 * URL de redirection, s'il en faut une : choisir un département quand aucun n'est indiqué, ou
 * relancer la page avec la visite guidée lors d'une première venue.
 */
async function dashboardRedirect(
  session: Session,
  churchId: string,
  params: { dept?: string; event?: string; view: string; tour?: string },
  shouldTriggerTour: boolean
) {
  const { dept, event, view, tour } = params;
  // Auto-select first department when none is specified
  if (!dept) {
    const firstDeptId = await defaultDepartmentId(session, churchId);
    if (!firstDeptId) return null;
    const qs = new URLSearchParams({ dept: firstDeptId });
    if (view !== "event") qs.set("view", view);
    if (tour) qs.set("tour", tour);
    if (shouldTriggerTour) qs.set("tour", "1");
    return `/dashboard?${qs.toString()}`;
  }
  // If dept is already selected but tour hasn't been seen, redirect with tour=1
  if (!shouldTriggerTour) return null;
  const qs = new URLSearchParams();
  qs.set("dept", dept);
  if (event) qs.set("event", event);
  if (view !== "event") qs.set("view", view);
  qs.set("tour", "1");
  return `/dashboard?${qs.toString()}`;
}

/** Contenu principal selon la vue : planning hebdo/mensuel, tâches, équipe, ou grille d'un événement. */
function dashboardContent({
  view,
  churchId,
  deptId,
  eventId,
  departmentName,
  churchName,
  canEdit,
}: {
  view: string;
  churchId: string;
  deptId?: string;
  eventId?: string;
  departmentName?: string;
  churchName?: string;
  canEdit: boolean;
}): ReactNode {
  if (DEPARTMENT_VIEWS.has(view) && !deptId) return <SelectPrompt needsDepartment />;
  if (deptId) {
    switch (view) {
      case "week":
        return (
          <WeeklyPlanningView
            churchId={churchId}
            departmentId={deptId}
            departmentName={departmentName}
            churchName={churchName}
            canEdit={canEdit}
          />
        );
      case "tasks":
        return <DepartmentTasksView departmentId={deptId} departmentName={departmentName} readOnly={!canEdit} />;
      case "month":
        return <MonthlyPlanningView departmentId={deptId} departmentName={departmentName} churchName={churchName} />;
      case "team":
        return <TeamEventsView departmentId={deptId} departmentName={departmentName} canEdit={canEdit} />;
    }
  }
  if (eventId && deptId) {
    return <PlanningGrid eventId={eventId} departmentId={deptId} readOnly={!canEdit} />;
  }
  return <SelectPrompt needsDepartment={!deptId} />;
}

interface DashboardProps {
  readonly searchParams: Promise<{ dept?: string; event?: string; view?: string; tour?: string }>;
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

  // Rediriger vers le dashboard pastoral si l'utilisateur a un profil dans l'église courante,
  // sauf si le cookie indique explicitement le mode admin
  const cookieStore = await cookies();
  const viewMode = cookieStore.get("koinonia-view-mode")?.value;
  const pastoralChurchIds = session.user.pastoralChurchIds ?? [];
  const isPastoralChurch = currentChurchId ? pastoralChurchIds.includes(currentChurchId) : false;
  const hasClassicRole = session.user.churchRoles.some((r) => r.churchId === currentChurchId);
  if (isPastoralView({ isPastoral: isPastoralChurch, hasClassicRole, viewModeCookie: viewMode })) redirect("/pastoral");

  if (!currentChurchId) {
    return (
      <EmptyState
        icon={Church}
        title="Aucune église"
        description="Vous n'êtes rattaché à aucune église. Contactez un administrateur."
      />
    );
  }

  // planning:department (grille par département) — le STAR ne l'a pas, spec 031/#462
  await requireChurchPermission("planning:department", currentChurchId);

  // Permissions calculées sur l'église courante uniquement (spec 024) — sinon un
  // responsable de l'église A obtient planning:edit dans l'église B (spec 031/T19).
  const userPermissions = new Set(
    session.user.churchRoles
      .filter((r) => r.churchId === currentChurchId)
      .flatMap((r) => rolePermissions[r.role] ?? [])
  );
  const canEditPlanning = userPermissions.has("planning:edit");

  // Auto-trigger guided tour on first visit with a role
  const shouldTriggerTour =
    !session.user.hasSeenTour &&
    !tour &&
    session.user.churchRoles.length > 0;

  const redirectUrl = await dashboardRedirect(
    session,
    currentChurchId,
    { dept: selectedDeptId, event: selectedEventId, view, tour },
    shouldTriggerTour
  );
  if (redirectUrl) redirect(redirectUrl);

  // Get church name for the current church
  const hasCurrentChurchRole = session.user.churchRoles.some(
    (r) => r.churchId === currentChurchId
  );
  const churchName = hasCurrentChurchRole
    ? (await prisma.church.findUnique({
        where: { id: currentChurchId },
        select: { name: true },
      }))?.name ?? undefined
    : undefined;

  // Fetch department name (for month, tasks and week views)
  const selectedDepartment =
    DEPARTMENT_VIEWS.has(view) && selectedDeptId
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

  // Nom du département : déjà chargé pour les vues semaine/mois/tâches/équipe, et porté par les
  // événements (eventDepts.department) pour la vue saisie — sans requête supplémentaire.
  const departmentName =
    selectedDepartment?.name ??
    events.flatMap((e) => e.eventDepts).find((ed) => ed.departmentId === selectedDeptId)?.department.name;

  const content = dashboardContent({
    view,
    churchId: currentChurchId,
    deptId: selectedDeptId,
    eventId: selectedEventId,
    departmentName: selectedDepartment?.name,
    churchName,
    canEdit: canEditPlanning,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Planning du département" title={departmentName ?? "Planning"}>
        <DashboardActions />
      </PageHeader>

      {view === "event" && (
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
      )}

      {content}
    </div>
  );
}
