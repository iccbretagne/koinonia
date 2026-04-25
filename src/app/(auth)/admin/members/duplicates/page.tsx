import { requireChurchPermission, getCurrentChurchId, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import DuplicatesView from "./DuplicatesView";

export default async function DuplicatesPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-gray-500">Aucune église sélectionnée.</p>;
  await requireChurchPermission("members:manage", churchId);

  const members = await prisma.member.findMany({
    where: { departments: { some: { department: { ministry: { churchId } } } } },
    include: {
      departments: {
        include: {
          department: { select: { id: true, name: true, ministry: { select: { name: true } } } },
        },
        orderBy: { isPrimary: "desc" },
      },
      userLink: { select: { userId: true, user: { select: { name: true, email: true } } } },
      _count: { select: { plannings: true, discipleships: true, disciplesMade: true } },
    },
  });

  // Détection doublons : même nom normalisé ou même email
  type MemberRow = (typeof members)[number];
  type DuplicateGroup = { reason: "same_name" | "same_email" | "both"; members: MemberRow[] };

  const byName = new Map<string, MemberRow[]>();
  for (const m of members) {
    const key = `${m.firstName.trim().toLowerCase()} ${m.lastName.trim().toLowerCase()}`;
    const b = byName.get(key) ?? [];
    b.push(m);
    byName.set(key, b);
  }

  const byEmail = new Map<string, MemberRow[]>();
  for (const m of members) {
    if (!m.email) continue;
    const key = m.email.trim().toLowerCase();
    const b = byEmail.get(key) ?? [];
    b.push(m);
    byEmail.set(key, b);
  }

  const pairKey = (ids: string[]) => [...ids].sort().join("|");
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  for (const bucket of byName.values()) {
    if (bucket.length < 2) continue;
    const key = pairKey(bucket.map((m) => m.id));
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ reason: "same_name", members: bucket });
  }

  for (const bucket of byEmail.values()) {
    if (bucket.length < 2) continue;
    const key = pairKey(bucket.map((m) => m.id));
    const existing = groups.find((g) => pairKey(g.members.map((m) => m.id)) === key);
    if (existing) {
      existing.reason = "both";
    } else if (!seen.has(key)) {
      seen.add(key);
      groups.push({ reason: "same_email", members: bucket });
    }
  }

  const serialized = groups.map((g) => ({
    reason: g.reason,
    members: g.members.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      departments: m.departments.map((d) => ({
        id: d.department.id,
        name: d.department.name,
        ministryName: d.department.ministry.name,
        isPrimary: d.isPrimary,
      })),
      userLink: m.userLink
        ? { userId: m.userLink.userId, name: m.userLink.user.name, email: m.userLink.user.email }
        : null,
      counts: { plannings: m._count.plannings, disciples: m._count.discipleships, disciplesMade: m._count.disciplesMade },
    })),
  }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/members" className="text-sm text-icc-violet hover:underline">
          ← Retour
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Doublons potentiels</h1>
      </div>
      <DuplicatesView groups={serialized} churchId={churchId} />
    </div>
  );
}
