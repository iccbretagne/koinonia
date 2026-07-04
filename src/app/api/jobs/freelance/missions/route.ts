import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const modalityEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

const createMissionSchema = z.object({
  title:        z.string().min(1).max(200),
  domain:       z.string().min(1).max(150),
  duration:     z.string().max(100).optional().nullable(),
  dailyRate:    z.string().max(100).optional().nullable(),
  hourlyRate:   z.string().max(100).optional().nullable(),
  modality:     modalityEnum.default("REMOTE"),
  location:     z.string().max(150).optional().nullable(),
  description:  z.string().min(1),
  contactEmail: z.string().email().max(150).optional().nullable(),
  contactUrl:   z.string().url().max(500).optional().nullable(),
});

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
    const session = await requirePermission("jobs:freelance");
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
        await prisma.notification.create({
          data: {
            userId:  sub.userId,
            type:    "FREELANCE_MISSION",
            title:   "Nouvelle mission freelance",
            message: `${authorName} propose une mission : « ${mission.title} »`,
            link:    `/jobs/freelance/missions/${mission.id}`,
          },
        });
      }
    })
  );
}
