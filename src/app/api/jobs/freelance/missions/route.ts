import { prisma } from "@/lib/prisma";
import { requireAuth, requirePlatformPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { createNotification } from "@/lib/notifications";
import { createMissionSchema } from "./contract";

export async function GET() {
  try {
    await requireAuth();

    const missions = await prisma.freelanceMission.findMany({
      where: { status: "ACTIVE" },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(missions);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformPermission("jobs:freelance");
    const data = createMissionSchema.parse(await request.json());

    const mission = await prisma.freelanceMission.create({
      data: { ...data, authorId: session.user.id! },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    void notifyFreelanceMissionSubscribers(mission).catch(() => null);

    return successResponse(mission, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifyFreelanceMissionSubscribers(mission: {
  id: string;
  title: string;
  author: { name: string | null; displayName: string | null };
}) {
  const subs = await prisma.jobNotificationSubscription.findMany({
    where: { wantFreelanceMissions: true },
    select: { userId: true, inApp: true },
  });

  const authorName = mission.author.displayName ?? mission.author.name ?? "Quelqu'un";

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.inApp) {
        await createNotification({
          userId:  sub.userId,
          domain:  "jobs",
          type:    "FREELANCE_MISSION",
          title:   "Nouvelle mission freelance",
          message: `${authorName} propose une mission : « ${mission.title} »`,
          link:    `/jobs/freelance/missions/${mission.id}`,
        });
      }
    })
  );
}
