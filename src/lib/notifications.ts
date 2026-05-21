import { prisma } from "@/lib/prisma";

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  await prisma.notification.create({ data: params });
}

/** Notifie tous les utilisateurs ayant un rôle donné dans une église. */
export async function notifyUsersWithRole(
  churchId: string,
  role: string,
  notification: { type: string; title: string; message: string; link?: string }
): Promise<void> {
  const roles = await prisma.userChurchRole.findMany({
    where: { churchId, role: role as never },
    select: { userId: true },
  });
  if (roles.length === 0) return;
  await prisma.notification.createMany({
    data: roles.map((r) => ({ userId: r.userId, ...notification })),
    skipDuplicates: true,
  });
}

/** Notifie tous les membres d'un département ayant une fonction système donnée. */
export async function notifyDeptMembers(
  churchId: string,
  deptFunction: string,
  notification: { type: string; title: string; message: string; link?: string }
): Promise<void> {
  const members = await prisma.userChurchRole.findMany({
    where: {
      churchId,
      departments: { some: { department: { function: deptFunction, ministry: { churchId } } } },
    },
    select: { userId: true },
  });
  // Also include users with events:manage (global managers see everything)
  const managers = await prisma.userChurchRole.findMany({
    where: { churchId, role: { in: ["SUPER_ADMIN", "ADMIN", "SECRETARY"] as never[] } },
    select: { userId: true },
  });
  const userIds = Array.from(new Set([...members, ...managers].map((r) => r.userId)));
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...notification })),
    skipDuplicates: true,
  });
}
