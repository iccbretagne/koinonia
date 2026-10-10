import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  Church,
  Headphones,
  Inbox,
  LayoutGrid,
  Plus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registry } from "@/lib/registry";
import { buildWeekEventsQuery } from "@/lib/week";
import { getEventTypeLabel } from "@/lib/event-types";
import DateTile from "@/components/DateTile";
import { eventTypeTone } from "@/components/event-type-tone";
import EmptyState from "@/components/ui/EmptyState";
import UnstaffedChip from "@/components/UnstaffedChip";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { serviceStatusDescriptor } from "@/components/ui/status";
import { NextServiceCard } from "../planning/MyPlanningView";
import { loadMyPlanning } from "../planning/my-planning-data";
import { loadMyRequests } from "../requests/my-requests-data";
import { REQUEST_TYPE_LABEL, requestStatus, requestTypeIcon } from "../requests/request-display";
import { pickFirstName } from "./first-name";
import { countUnstaffedDepartments, getStaffingGapViewer } from "@/modules/planning";

/**
 * Accueil « Aujourd'hui » (spec 055, lot 4) : assemble, pour le rôle connecté, des données que
 * l'utilisateur voit déjà ailleurs — aucune donnée nouvelle, aucun périmètre élargi.
 *
 * - Prochains services : `loadMyPlanning` (même source que « Mon planning », `/planning`),
 *   sous `planning:view` et seulement pour un compte lié à une fiche STAR (comme le lien de menu).
 * - Agenda de l'église : même requête que `/events` sous `events:view`, sinon la semaine de
 *   `/planning/events` (`buildWeekEventsQuery`) sous `planning:view`.
 * - Demandes en cours : `loadMyRequests` (même source que « Mes demandes », `/requests`), sous
 *   `members:view`.
 * - Raccourcis : uniquement vers les sections que les mêmes gardes ouvrent déjà.
 *
 * Chaque garde passe par `requireChurchPermission`, exactement comme la page source.
 */

const MAX_SERVICES = 4;
const MAX_EVENTS = 5;
const MAX_REQUESTS = 4;
const OPEN_REQUEST_STATUSES = new Set(["EN_ATTENTE", "EN_COURS", "APPROUVEE"]);

async function can(permission: string, churchId: string): Promise<boolean> {
  try {
    await requireChurchPermission(permission, churchId);
    return true;
  } catch {
    return false;
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}

function SectionTitle({ title, href, linkLabel }: { readonly title: string; readonly href?: string; readonly linkLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
      {href && linkLabel && (
        <Link
          href={href}
          className="shrink-0 rounded-chip text-[13px] font-semibold leading-[18px] text-brand-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

const rowLinkClasses =
  "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

interface Shortcut {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

type MyPlanning = NonNullable<Awaited<ReturnType<typeof loadMyPlanning>>>;
type UpcomingService = MyPlanning["plannings"][number];
type AgendaRow = {
  key: string;
  date: Date;
  title: string;
  meta: string;
  status: ReturnType<typeof serviceStatusDescriptor>;
  href: string;
};
type ChurchEvent = { id: string; title: string; type: string; date: Date };
type MyRequest = NonNullable<Awaited<ReturnType<typeof loadMyRequests>>>[number];

/** Services à venir (même tri et même filtre que « Mon planning »). */
function upcomingServicesOf(myPlanning: MyPlanning | null, now: Date) {
  return (myPlanning?.plannings ?? [])
    .filter((p) => new Date(p.eventDepartment.event.date) >= now)
    .sort((a, b) => new Date(a.eventDepartment.event.date).getTime() - new Date(b.eventDepartment.event.date).getTime());
}

/** Prochains rendez-vous après le prochain service, événements d'équipe inclus. */
function agendaRowsOf(myPlanning: MyPlanning | null, upcomingServices: UpcomingService[], now: Date): AgendaRow[] {
  const upcomingTeamEvents = (myPlanning?.teamEvents ?? []).filter((t) => new Date(t.endsAt) >= now);
  return [
    ...upcomingServices.slice(1).map((p) => ({
      key: p.id,
      date: new Date(p.eventDepartment.event.date),
      title: p.eventDepartment.event.title,
      meta: `${formatTime(new Date(p.eventDepartment.event.date))} · ${p.eventDepartment.department.name}`,
      status: serviceStatusDescriptor(p.status),
      href: `/events/${p.eventDepartment.event.id}/star-view`,
    })),
    ...upcomingTeamEvents.map((t) => {
      const locationSuffix = t.location ? ` · ${t.location}` : "";
      return {
        key: `team-${t.id}`,
        date: new Date(t.startsAt),
        title: t.title,
        meta: `${formatTime(new Date(t.startsAt))} · ${t.department.name}${locationSuffix}`,
        status: null,
        href: "/planning",
      };
    }),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_SERVICES);
}

/** Raccourcis : uniquement vers les sections que les mêmes gardes ouvrent déjà. */
function shortcutsFor(access: {
  hasMyPlanning: boolean;
  canDepartment: boolean;
  canEvents: boolean;
  canPlanning: boolean;
  canRequests: boolean;
  canAudio: boolean;
}): Shortcut[] {
  let agendaShortcut: Shortcut[] = [];
  if (access.canEvents) {
    agendaShortcut = [{ href: "/events", label: "Agenda de l'église", description: "Calendrier des événements", icon: CalendarDays }];
  } else if (access.canPlanning) {
    agendaShortcut = [{ href: "/planning/events", label: "Agenda de l'église", description: "Les événements de la semaine", icon: CalendarDays }];
  }
  return [
    ...(access.hasMyPlanning ? [{ href: "/planning", label: "Mon planning", description: "Mes services du mois", icon: CalendarCheck }] : []),
    ...(access.canDepartment
      ? [{ href: "/dashboard", label: "Planning", description: "Saisir le planning d'un département", icon: LayoutGrid }]
      : []),
    ...agendaShortcut,
    ...(access.canRequests ? [{ href: "/requests", label: "Mes demandes", description: "Annonces, visuels, événements", icon: Inbox }] : []),
    ...(access.canAudio ? [{ href: "/audio", label: "Audio", description: "Réécouter les cultes", icon: Headphones }] : []),
    { href: "/profile", label: "Mon profil", description: "Compte, apparence, notifications", icon: UserRound },
  ];
}

function ServicesSection({
  myPlanning,
  nextService,
  agendaRows,
}: {
  readonly myPlanning: MyPlanning;
  readonly nextService: UpcomingService | undefined;
  readonly agendaRows: AgendaRow[];
}) {
  return (
    <section aria-label="Mes services" className="flex flex-col gap-3">
      {nextService ? (
        <NextServiceCard
          planning={nextService}
          tasks={
            myPlanning.tasksByEvent[
              `${nextService.eventDepartment.event.id}_${nextService.eventDepartment.department.id}`
            ] ?? []
          }
          contacts={myPlanning.contactsByDepartment[nextService.eventDepartment.department.id] ?? []}
        />
      ) : (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarOff}
            title="Aucun service à venir"
            description="Votre responsable de département vous assignera à des événements."
            size="sm"
          />
        </div>
      )}

      {agendaRows.length > 0 && (
        <>
          <SectionTitle title="Mes prochains rendez-vous" href="/planning" linkLabel="Mon planning" />
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {agendaRows.map((row) => (
              <li key={row.key} className="border-t border-line first:border-t-0">
                <Link href={row.href} className={rowLinkClasses}>
                  <DateTile date={row.date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{row.title}</p>
                    <p className="truncate text-[13px] leading-[18px] text-ink-muted">{row.meta}</p>
                  </div>
                  {row.status ? (
                    <StatusChip tone={row.status.tone} icon={row.status.icon} className="shrink-0">
                      <span className="hidden sm:inline">{row.status.label}</span>
                      <span className="sm:hidden">{row.status.tone === "brand" ? "Debrief" : row.status.label}</span>
                    </StatusChip>
                  ) : (
                    <StatusChip tone="neutral" icon={Users} className="shrink-0">
                      Équipe
                    </StatusChip>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ChurchEventsSection({
  canEvents,
  upcomingEvents,
  unstaffed,
}: {
  readonly canEvents: boolean;
  readonly upcomingEvents: ChurchEvent[];
  readonly unstaffed: Map<string, number>;
}) {
  return (
    <section aria-labelledby="today-events" className="flex flex-col gap-3">
      <div id="today-events">
        <SectionTitle
          title={canEvents ? "Prochains événements de l'église" : "Cette semaine à l'église"}
          href={canEvents ? "/events" : "/planning/events"}
          linkLabel="Tout l'agenda"
        />
      </div>
      {upcomingEvents.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={CalendarDays}
            title={canEvents ? "Aucun événement à venir" : "Plus d'événement cette semaine"}
            size="sm"
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {upcomingEvents.map((event) => (
            <li key={event.id} className="border-t border-line first:border-t-0">
              <Link href={`/events/${event.id}/star-view`} className={rowLinkClasses}>
                <DateTile date={event.date} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">{event.title}</p>
                  <p className="text-[13px] leading-[18px] text-ink-muted">
                    {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
                    {formatTime(event.date)}
                  </p>
                </div>
                {(unstaffed.get(event.id) ?? 0) > 0 && <UnstaffedChip count={unstaffed.get(event.id)!} />}
                <StatusChip tone={eventTypeTone(event.type)} className="shrink-0">
                  {getEventTypeLabel(event.type)}
                </StatusChip>
                <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-ink-subtle sm:block" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestsSection({ openRequests }: { readonly openRequests: MyRequest[] }) {
  return (
    <section aria-labelledby="today-requests" className="flex flex-col gap-3">
      <div id="today-requests">
        <SectionTitle title="Mes demandes en cours" href="/requests" linkLabel="Toutes mes demandes" />
      </div>
      {openRequests.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={Inbox}
            title="Aucune demande en cours"
            action={
              <Link href="/requests/new" className={buttonClasses("secondary", "sm")}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Nouvelle demande
              </Link>
            }
            size="sm"
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {openRequests.slice(0, MAX_REQUESTS).map((req) => {
            const Icon = requestTypeIcon(req.type);
            const status = requestStatus(req.status);
            return (
              <li key={req.id} className="border-t border-line first:border-t-0">
                <Link href="/requests" className={rowLinkClasses}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-text">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-[22px] text-ink">
                      {req.announcement ? req.announcement.title : req.title}
                    </p>
                    <p className="truncate text-[13px] leading-[18px] text-ink-muted">
                      {REQUEST_TYPE_LABEL[req.type] ?? req.type} · envoyée le{" "}
                      {req.submittedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <StatusChip tone={status.tone} className="shrink-0">
                    {status.label}
                  </StatusChip>
                </Link>
              </li>
            );
          })}
          {openRequests.length > MAX_REQUESTS && (
            <li className="border-t border-line px-4 py-2.5 text-[13px] text-ink-muted">
              Et {openRequests.length - MAX_REQUESTS} autre{openRequests.length - MAX_REQUESTS > 1 ? "s" : ""} en cours.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function ShortcutsSection({ shortcuts }: { readonly shortcuts: Shortcut[] }) {
  return (
    <section aria-labelledby="today-shortcuts" className="flex flex-col gap-3">
      <h2 id="today-shortcuts" className="font-display text-[17px] font-semibold leading-6 text-ink">
        Raccourcis
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {shortcuts.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card transition-colors duration-120 hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-text">
                <s.icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-[22px] text-ink">{s.label}</span>
                <span className="block truncate text-[13px] leading-[18px] text-ink-muted">{s.description}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function TodayPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (!churchId) {
    return (
      <EmptyState icon={Church} title="Aucune église sélectionnée" description="Choisissez une église dans le menu." />
    );
  }

  const planningModule = registry.has("planning");
  const [canPlanning, canDepartment, canEvents, canRequests, canAudio, church] = await Promise.all([
    planningModule ? can("planning:view", churchId) : false,
    planningModule ? can("planning:department", churchId) : false,
    planningModule ? can("events:view", churchId) : false,
    planningModule ? can("members:view", churchId) : false,
    registry.has("audio") ? can("audio:listen", churchId) : false,
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }),
  ]);

  const loadChurchEvents = () => {
    if (canEvents) {
      // Même périmètre que l'agenda de l'église (/events, `where: { churchId }`), bornée à
      // partir d'aujourd'hui et limitée au nombre affiché : la page n'a besoin d'aucun
      // événement passé, inutile de tous les charger pour n'en montrer que MAX_EVENTS.
      return prisma.event.findMany({
        where: { churchId, date: { gte: startOfToday } },
        orderBy: { date: "asc" },
        take: MAX_EVENTS,
        select: { id: true, title: true, type: true, date: true },
      });
    }
    // Même requête que l'agenda STAR de la semaine (/planning/events).
    if (canPlanning) return prisma.event.findMany(buildWeekEventsQuery(churchId, now));
    return null;
  };

  const [myPlanning, churchEvents, myRequests] = await Promise.all([
    canPlanning ? loadMyPlanning(session.user.id, churchId) : null,
    loadChurchEvents(),
    canRequests ? loadMyRequests(session.user.id, churchId) : null,
  ]);

  // Le prénom de la fiche STAR liée fait foi (champ prénom dédié) ; il est lu même sans accès à
  // « Mon planning », via le même lien compte ↔ fiche que cette page et /profile utilisent déjà.
  const linkedMember =
    myPlanning?.member ??
    (
      await prisma.memberUserLink.findUnique({
        where: { userId_churchId: { userId: session.user.id, churchId } },
        select: { member: { select: { firstName: true } } },
      })
    )?.member;
  const name =
    pickFirstName(linkedMember?.firstName) ??
    pickFirstName(session.user.displayName) ??
    pickFirstName(session.user.name);

  // Services à venir (même tri et même filtre que « Mon planning »), événements d'équipe inclus.
  const upcomingServices = upcomingServicesOf(myPlanning, now);
  const nextService = upcomingServices[0];
  const agendaRows = agendaRowsOf(myPlanning, upcomingServices, now);

  const upcomingEvents = (churchEvents ?? []).filter((e) => e.date >= now).slice(0, MAX_EVENTS);
  // Départements sans STAR planifié, pour qui peut planifier (même repère que l'agenda).
  const gapViewer = canDepartment ? await getStaffingGapViewer(session, churchId) : null;
  const unstaffed = gapViewer ? await countUnstaffedDepartments(upcomingEvents, gapViewer, now) : new Map<string, number>();
  const openRequests = (myRequests ?? []).filter((r) => OPEN_REQUEST_STATUSES.has(r.status));

  const shortcuts = shortcutsFor({
    hasMyPlanning: myPlanning !== null,
    canDepartment,
    canEvents,
    canPlanning,
    canRequests,
    canAudio,
  });

  const hasAside = canRequests || shortcuts.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="mb-1 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle first-letter:uppercase">
          {dateLabel}
          {church?.name ? ` · ${church.name}` : ""}
        </p>
        <h1 className="font-display text-[22px] font-bold leading-7 tracking-[-0.015em] text-ink md:text-[28px] md:leading-[34px]">
          {name ? `Bonjour ${name}` : "Bonjour"}
        </h1>
      </header>

      <div className={`grid grid-cols-1 gap-6 ${hasAside ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-6">
          {myPlanning && <ServicesSection myPlanning={myPlanning} nextService={nextService} agendaRows={agendaRows} />}

          {churchEvents && <ChurchEventsSection canEvents={canEvents} upcomingEvents={upcomingEvents} unstaffed={unstaffed} />}
        </div>

        {hasAside && (
          <aside className="flex min-w-0 flex-col gap-6">
            {canRequests && <RequestsSection openRequests={openRequests} />}

            <ShortcutsSection shortcuts={shortcuts} />
          </aside>
        )}
      </div>
    </div>
  );
}
