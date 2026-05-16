import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { requireAgendaManage } from "@/modules/agenda/auth";
import { prisma } from "@/lib/prisma";
import AgendaCalendar from "./AgendaCalendar";
import PublicUrlBanner from "./PublicUrlBanner";
import Link from "next/link";
import Button from "@/components/ui/Button";

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
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
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
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agenda pastoral</h1>
        <div className="flex gap-2">
          <Link href="/agenda/schedule">
            <Button size="sm" variant="info">Planifier RDV</Button>
          </Link>
          <Link href="/agenda/new">
            <Button size="sm">+ Entrée directe</Button>
          </Link>
        </div>
      </div>
      {church?.slug && <PublicUrlBanner slug={church.slug} />}
      {profiles.length === 0 ? (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Aucun profil pastoral configuré.{" "}
          <a href="/admin/pastoral-profiles" className="underline">Configurer maintenant →</a>
        </div>
      ) : (
        <AgendaCalendar profiles={profiles} entries={entries} weekStart={toLocalISO(from)} />
      )}
    </div>
  );
}
