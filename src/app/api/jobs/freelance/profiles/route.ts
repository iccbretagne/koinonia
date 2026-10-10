import { prisma } from "@/lib/prisma";
import { requireAuth, requirePlatformPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { createNotification } from "@/lib/notifications";
import { createProfileSchema } from "./contract";

export async function GET() {
  try {
    await requireAuth();

    const profiles = await prisma.freelanceProfile.findMany({
      where: { status: "ACTIVE" },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(profiles);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformPermission("jobs:freelance");
    const data = createProfileSchema.parse(await request.json());

    const profile = await prisma.freelanceProfile.create({
      data: {
        ...data,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        authorId: session.user.id!,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    void notifyFreelanceProfileSubscribers(profile).catch(() => null);

    return successResponse(profile, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifyFreelanceProfileSubscribers(profile: {
  id: string;
  title: string;
  author: { name: string | null; displayName: string | null };
}) {
  const subs = await prisma.jobNotificationSubscription.findMany({
    where: { wantFreelanceProfiles: true },
    select: { userId: true, inApp: true },
  });

  const authorName = profile.author.displayName ?? profile.author.name ?? "Quelqu'un";

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.inApp) {
        await createNotification({
          userId:  sub.userId,
          domain:  "jobs",
          type:    "FREELANCE_PROFILE",
          title:   "Nouveau freelance disponible",
          message: `${authorName} propose ses services : « ${profile.title} »`,
          link:    `/jobs/freelance/profiles/${profile.id}`,
        });
      }
    })
  );
}
