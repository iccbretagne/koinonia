import { auth, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import SwitchChurchLink from "@/components/SwitchChurchLink";

const roleLabel: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistant pasteur",
  BERGER: "Berger",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export default async function PastoralDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!(session.user.pastoralChurchIds ?? []).length) redirect("/dashboard");

  const now = new Date();
  const currentChurchId = await getCurrentChurchId(session);

  // Cherche d'abord un profil direct dans l'église courante
  let profile = await prisma.pastoralProfile.findFirst({
    where: {
      userId: session.user.id,
      ...(currentChurchId ? { churchId: currentChurchId } : {}),
    },
    select: {
      id: true,
      role: true,
      name: true,
      churchId: true,
      church: { select: { id: true, name: true } },
      responsibleForChurch: { select: { id: true, name: true } },
    },
  });

  // Si l'église courante est une église supervisée (pas de profil direct là),
  // on utilise le profil qui en est superviseur
  if (!profile && currentChurchId) {
    profile = await prisma.pastoralProfile.findFirst({
      where: {
        userId: session.user.id,
        supervisorForChurches: { some: { id: currentChurchId } },
      },
      select: {
        id: true,
        role: true,
        name: true,
        churchId: true,
        church: { select: { id: true, name: true } },
        responsibleForChurch: { select: { id: true, name: true } },
      },
    });
  }

  if (!profile) redirect("/dashboard");

  // L'utilisateur a-t-il un rôle classique dans l'église courante (en plus du profil pastoral) ?
  const hasClassicRole = currentChurchId
    ? session.user.churchRoles.some((r) => r.churchId === currentChurchId)
    : false;

  // Églises supervisées par ce profil pastoral
  const supervisedChurches = await prisma.church.findMany({
    where: { supervisorProfileId: profile.id },
    select: {
      id: true,
      name: true,
      responsible: { select: { id: true, name: true, role: true } },
    },
  });

  // IDs des églises dont ce profil est acteur (responsable ou superviseur)
  const churchIds = Array.from(new Set([
    profile.responsibleForChurch?.id,
    ...supervisedChurches.map((c) => c.id),
  ].filter(Boolean))) as string[];

  const allChurchIds = churchIds.length > 0 ? churchIds : [profile.churchId];

  // Prochains événements (toutes les églises concernées, 5 max)
  const upcomingEvents = await prisma.event.findMany({
    where: { churchId: { in: allChurchIds }, date: { gte: now } },
    orderBy: { date: "asc" },
    take: 5,
    select: { id: true, title: true, type: true, date: true, church: { select: { name: true } } },
  });

  // Prochaines entrées agenda de ce pasteur (5 max)
  const upcomingAgenda = await prisma.agendaEntry.findMany({
    where: { recipientId: profile.id, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 5,
    select: { id: true, title: true, type: true, startsAt: true, location: true },
  });

  // Nombre de membres par église concernée
  const memberCounts = await Promise.all(
    allChurchIds.map(async (cId) => {
      const count = await prisma.member.count({
        where: { departments: { some: { department: { ministry: { churchId: cId } } } } },
      });
      return { churchId: cId, count };
    })
  );
  const countByChurch = Object.fromEntries(memberCounts.map((m) => [m.churchId, m.count]));

  const churchCards = [
    ...(profile.responsibleForChurch
      ? [{ ...profile.responsibleForChurch, isResponsible: true }]
      : []),
    ...supervisedChurches
      .filter((c) => c.id !== profile.responsibleForChurch?.id)
      .map((c) => ({ ...c, isResponsible: false })),
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {session.user.displayName ?? session.user.name}
        </h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-sm text-gray-500">
            {roleLabel[profile.role]} · {profile.church.name}
          </p>
          {hasClassicRole && (
            <Link
              href="/dashboard?mode=admin"
              className="text-xs text-icc-violet hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Vue administration
            </Link>
          )}
        </div>
      </div>

      {/* Cartes d'églises */}
      {churchCards.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            {churchCards.length === 1 ? "Mon église" : "Mes églises"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {churchCards.map((church) => (
              <div key={church.id} className="border-2 border-gray-200 rounded-lg p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900">{church.name}</p>
                  {"isResponsible" in church && church.isResponsible && (
                    <span className="shrink-0 text-xs bg-icc-violet/10 text-icc-violet font-medium px-2 py-0.5 rounded-full">
                      Responsable
                    </span>
                  )}
                  {"isResponsible" in church && !church.isResponsible && (
                    <span className="shrink-0 text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">
                      Superviseur
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {countByChurch[church.id] ?? 0} membres
                  </span>
                </div>
                {"responsible" in church && church.responsible && (
                  <p className="text-xs text-gray-400">
                    Resp. : {church.responsible.name} ({roleLabel[church.responsible.role]})
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <SwitchChurchLink
                    churchId={church.id}
                    href="/pastoral/members"
                    className="text-xs text-icc-violet hover:underline"
                  >
                    Membres →
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href="/pastoral/events"
                    className="text-xs text-icc-violet hover:underline"
                  >
                    Événements →
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href="/pastoral/reports"
                    className="text-xs text-icc-violet hover:underline"
                  >
                    Comptes rendus →
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href="/pastoral/accounting"
                    className="text-xs text-icc-violet hover:underline"
                  >
                    Comptabilité →
                  </SwitchChurchLink>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agenda pastoral */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">Mon agenda</h2>
            <a href={`/agenda/${profile.id}`} className="text-xs text-icc-violet hover:underline">
              Tout voir →
            </a>
          </div>
          {upcomingAgenda.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucun rendez-vous à venir.</p>
          ) : (
            <div className="space-y-2">
              {upcomingAgenda.map((entry) => (
                <div key={entry.id} className="flex gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                  <div className="w-14 shrink-0 text-xs text-gray-400 pt-0.5">
                    {formatDate(entry.startsAt)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{entry.title}</p>
                    {entry.location && (
                      <p className="text-xs text-gray-400 truncate">{entry.location}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Événements à venir */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700">Événements</h2>
            <a href="/events" className="text-xs text-icc-violet hover:underline">
              Calendrier →
            </a>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucun événement à venir.</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                  <div className="w-14 shrink-0 text-xs text-gray-400 pt-0.5">
                    {formatDate(event.date)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
                    {allChurchIds.length > 1 && (
                      <p className="text-xs text-gray-400 truncate">{event.church.name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
