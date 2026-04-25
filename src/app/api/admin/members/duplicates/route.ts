import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    await requireChurchPermission("members:manage", churchId);

    const members = await prisma.member.findMany({
      where: { departments: { some: { department: { ministry: { churchId } } } } },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } },
          },
          orderBy: { isPrimary: "desc" },
        },
        userLink: { select: { userId: true, user: { select: { name: true, email: true } } } },
        _count: { select: { plannings: true, discipleships: true, disciplesMade: true } },
      },
    });

    // Group by normalized name
    const byName = new Map<string, typeof members>();
    for (const m of members) {
      const key = `${m.firstName.trim().toLowerCase()} ${m.lastName.trim().toLowerCase()}`;
      const bucket = byName.get(key) ?? [];
      bucket.push(m);
      byName.set(key, bucket);
    }

    // Group by email (non-null)
    const byEmail = new Map<string, typeof members>();
    for (const m of members) {
      if (!m.email) continue;
      const key = m.email.trim().toLowerCase();
      const bucket = byEmail.get(key) ?? [];
      bucket.push(m);
      byEmail.set(key, bucket);
    }

    type DuplicateGroup = {
      reason: "same_name" | "same_email" | "both";
      members: typeof members;
    };

    const groups: DuplicateGroup[] = [];
    const seen = new Set<string>();

    const pairKey = (ids: string[]) => [...ids].sort().join("|");

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
      } else {
        seen.add(key);
        groups.push({ reason: "same_email", members: bucket });
      }
    }

    return successResponse(groups);
  } catch (error) {
    return errorResponse(error);
  }
}
