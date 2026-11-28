import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users } from "lucide-react";
import SwitchChurchLink from "@/components/SwitchChurchLink";
import { PageHeader, StatusChip, buttonClasses } from "@/components/ui";
import { paths } from "@/lib/paths";

const roleLabel: Record<string, string> = {
  PASTEUR: "Pasteur",
  ASSISTANT_PASTEUR: "Assistant pasteur",
  BERGER: "Berger",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Tableau pastoral (ex-page `/pastoral`, spec 092 lot 3) : rendu par l'Accueil en vue pastorale.
 * Renvoie `null` sans profil pastoral dans l'église courante (direct ou superviseur) — l'Accueil
 * commun s'affiche alors. Les liens mènent aux écrans communs (lecture pastorale).
 */
export default async function PastoralDashboard({
  session,
  currentChurchId,
}: {
  readonly session: Session;
  readonly currentChurchId: string;
}) {
  if (!(session.user.pastoralChurchIds ?? []).includes(currentChurchId)) return null;

  const now = new Date();

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

  if (!profile) return null;

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageHeader
        title={`Bonjour, ${session.user.displayName ?? session.user.name}`}
        description={`${roleLabel[profile.role]} · ${profile.church.name}`}
      />

      {/* Cartes d'églises */}
      {churchCards.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-[17px] font-semibold text-ink">
            {churchCards.length === 1 ? "Mon église" : "Mes églises"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {churchCards.map((church) => (
              <div key={church.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{church.name}</p>
                  {"isResponsible" in church && church.isResponsible && (
                    <StatusChip tone="brand" className="shrink-0">Responsable</StatusChip>
                  )}
                  {"isResponsible" in church && !church.isResponsible && (
                    <StatusChip className="shrink-0">Superviseur</StatusChip>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Users aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    {countByChurch[church.id] ?? 0} {(countByChurch[church.id] ?? 0) > 1 ? "membres" : "membre"}
                  </span>
                </div>
                {"responsible" in church && church.responsible && (
                  <p className="text-xs text-ink-muted">
                    Resp. : {church.responsible.name} ({roleLabel[church.responsible.role]})
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <SwitchChurchLink
                    churchId={church.id}
                    href={paths.pastoral.members()}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Membres
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href={paths.events()}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Événements
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href={paths.admin.reports()}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Comptes rendus
                  </SwitchChurchLink>
                  <SwitchChurchLink
                    churchId={church.id}
                    href={paths.accounting.requests()}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Comptabilité
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
            <h2 className="font-display text-[17px] font-semibold text-ink">Mon agenda</h2>
            <Link href={paths.agenda.profile(profile.id)} className={buttonClasses("ghost", "sm")}>
              Voir l&apos;agenda
            </Link>
          </div>
          {upcomingAgenda.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun rendez-vous à venir.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingAgenda.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card">
                  <div className="w-14 shrink-0 text-xs text-ink-subtle pt-0.5">
                    {formatDate(entry.startsAt)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{entry.title}</p>
                    {entry.location && (
                      <p className="truncate text-xs text-ink-muted">{entry.location}</p>
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
            <h2 className="font-display text-[17px] font-semibold text-ink">Événements</h2>
            <Link href={paths.events()} className={buttonClasses("ghost", "sm")}>
              Voir le calendrier
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun événement à venir.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card">
                  <div className="w-14 shrink-0 text-xs text-ink-subtle pt-0.5">
                    {formatDate(event.date)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{event.title}</p>
                    {allChurchIds.length > 1 && (
                      <p className="truncate text-xs text-ink-muted">{event.church.name}</p>
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
