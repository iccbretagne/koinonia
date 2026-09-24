import { prisma } from "@/lib/prisma";

/**
 * Statistiques du module care (spec 052, T61) : volumes des demandes de rendez-vous pastoral
 * par état/accompagnant/motif de rejet, et reprise à l'identique de la section MSDP retirée
 * de `/integration/stats` au lot 1 (déplacée ici, `care` étant désormais propriétaire du
 * suivi des nouveaux convertis).
 */

export interface AppointmentStats {
  total: number;
  byStatus: { status: string; count: number }[];
  byAssignee: { name: string; count: number }[];
  byRejectReason: { reasonCode: string; count: number }[];
}

export interface MsdpStats {
  salvationCalls: number;
  total: number;
  byStatus: { status: string; count: number }[];
  completed: number;
  abandoned: number;
  completionRate: number | null;
  avgDaysToContact: number | null;
  avgDaysToCompletion: number | null;
  byMonth: { month: string; count: number }[];
  journeyMilestones: { integratedInFamily: number; followsPcnc: number; isStar: number; inDiscipleship: number };
}

export interface CareStats {
  appointments: AppointmentStats;
  msdp: MsdpStats;
}

async function getAppointmentStats(churchId: string): Promise<AppointmentStats> {
  const [byStatusRaw, byAssigneeProfileRaw, byAssigneeMemberRaw, byRejectReasonRaw] = await Promise.all([
    prisma.appointmentRequest.groupBy({ by: ["status"], where: { churchId }, _count: true }),
    prisma.appointmentRequest.groupBy({
      by: ["assignedToId"],
      where: { churchId, assignedToId: { not: null } },
      _count: true,
    }),
    prisma.appointmentRequest.groupBy({
      by: ["assignedMemberId"],
      where: { churchId, assignedMemberId: { not: null } },
      _count: true,
    }),
    prisma.appointmentRequest.groupBy({
      by: ["rejectReasonCode"],
      where: { churchId, rejectReasonCode: { not: null } },
      _count: true,
    }),
  ]);

  const total = byStatusRaw.reduce((s, r) => s + r._count, 0);

  const [profiles, members] = await Promise.all([
    prisma.pastoralProfile.findMany({
      where: { id: { in: byAssigneeProfileRaw.map((r) => r.assignedToId!) } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: byAssigneeMemberRaw.map((r) => r.assignedMemberId!) } },
      select: { id: true, name: true, displayName: true },
    }),
  ]);
  const profileNames = new Map(profiles.map((p) => [p.id, p.name]));
  const memberNames = new Map(members.map((m) => [m.id, m.displayName ?? m.name ?? "—"]));

  const byAssignee = [
    ...byAssigneeProfileRaw.map((r) => ({
      name: profileNames.get(r.assignedToId!) ?? "—",
      count: r._count,
    })),
    ...byAssigneeMemberRaw.map((r) => ({
      name: memberNames.get(r.assignedMemberId!) ?? "—",
      count: r._count,
    })),
  ].sort((a, b) => b.count - a.count);

  return {
    total,
    byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count })),
    byAssignee,
    byRejectReason: byRejectReasonRaw.map((r) => ({ reasonCode: r.rejectReasonCode!, count: r._count })),
  };
}

async function getMsdpStats(churchId: string): Promise<MsdpStats> {
  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [
    salvationCalls,
    byStatusRaw,
    contactedRaw,
    completedRaw,
    recentRaw,
    pjIntegratedInFamily,
    pjFollowsPcnc,
    pjIsStar,
    pjInDiscipleship,
  ] = await Promise.all([
    prisma.familyIntegrationRequest.count({ where: { churchId, salvationCall: true } }),
    prisma.msdpFollowUp.groupBy({ by: ["status"], where: { churchId }, _count: true }),
    prisma.msdpFollowUp.findMany({
      where: { churchId, contactedAt: { not: null } },
      select: { createdAt: true, contactedAt: true },
    }),
    prisma.msdpFollowUp.findMany({
      where: { churchId, status: "COMPLETED", completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    }),
    prisma.msdpFollowUp.findMany({
      where: { churchId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.personJourney.count({ where: { churchId, integratedInFamily: true } }),
    prisma.personJourney.count({ where: { churchId, followsPcnc: true } }),
    prisma.personJourney.count({ where: { churchId, isStar: true } }),
    prisma.personJourney.count({ where: { churchId, inDiscipleship: true } }),
  ]);

  const statusMap = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count]));
  const total = byStatusRaw.reduce((s, r) => s + r._count, 0);
  const completed = statusMap["COMPLETED"] ?? 0;
  const abandoned = statusMap["ABANDONED"] ?? 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;

  const avgDaysToContact =
    contactedRaw.length > 0
      ? Math.round(
          contactedRaw.reduce((s, r) => s + (r.contactedAt!.getTime() - r.createdAt.getTime()) / 86_400_000, 0) /
            contactedRaw.length
        )
      : null;

  const avgDaysToCompletion =
    completedRaw.length > 0
      ? Math.round(
          completedRaw.reduce((s, r) => s + (r.completedAt!.getTime() - r.createdAt.getTime()) / 86_400_000, 0) /
            completedRaw.length
        )
      : null;

  const monthCounts: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    monthCounts[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
  }
  for (const r of recentRaw) {
    const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthCounts) monthCounts[key]++;
  }
  const byMonth = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    salvationCalls,
    total,
    byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count })),
    completed,
    abandoned,
    completionRate,
    avgDaysToContact,
    avgDaysToCompletion,
    byMonth,
    journeyMilestones: {
      integratedInFamily: pjIntegratedInFamily,
      followsPcnc: pjFollowsPcnc,
      isStar: pjIsStar,
      inDiscipleship: pjInDiscipleship,
    },
  };
}

export async function getCareStats(churchId: string): Promise<CareStats> {
  const [appointments, msdp] = await Promise.all([
    getAppointmentStats(churchId),
    getMsdpStats(churchId),
  ]);
  return { appointments, msdp };
}
