import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { prisma } from "@/lib/prisma";
import AgendaCalendar from "./AgendaCalendar";
import PublicUrlBanner from "./PublicUrlBanner";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { Alert, PageHeader, buttonClasses } from "@/components/ui";
import { paths } from "@/lib/paths";

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); // lundi
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

export default async function AgendaPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-sm text-ink-muted">Aucune église sélectionnée.</p>;
  await requireAgendaManage(churchId);

  const { week } = await searchParams;
  const refDate = week ? new Date(week) : new Date();
  const { from, to } = getWeekBounds(refDate);

  const [church, profiles, entries] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }),
    prisma.pastoralProfile.findMany({
      where: { churchId },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.agendaEntry.findMany({
      where: { churchId, startsAt: { gte: from, lt: to } },
      include: {
        recipient: { select: { id: true, name: true } },
        request: { select: { id: true, firstName: true, lastName: true, qualificationNote: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Agenda pastoral"
        actions={
          <>
            <Link href={paths.agenda.schedule()} className={buttonClasses("secondary")}>
              <CalendarClock aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Planifier les RDV
            </Link>
            <Link href={paths.agenda.newEntry()} className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Ajouter à l&apos;agenda
            </Link>
          </>
        }
      />
      {church?.slug && <PublicUrlBanner slug={church.slug} />}
      {profiles.length === 0 ? (
        <Alert
          tone="warning"
          title="Aucun profil pastoral configuré"
          action={
            <Link href={paths.admin.pastoralProfiles()} className={buttonClasses("secondary", "sm")}>
              Configurer les profils
            </Link>
          }
        >
          L&apos;agenda s&apos;affiche par profil pastoral.
        </Alert>
      ) : (
        <AgendaCalendar profiles={profiles} entries={entries} weekStart={toLocalISO(from)} />
      )}
    </div>
  );
}
