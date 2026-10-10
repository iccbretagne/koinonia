import { prisma } from "@/lib/prisma";
import { requireAuth, requirePlatformPermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { createNotification } from "@/lib/notifications";
import { createSeekerSchema } from "./contract";

function contractTypeFilter(type: "EMPLOI" | "STAGE" | "ALTERNANCE" | null) {
  if (type === "EMPLOI") return { wantEmploi: true };
  if (type === "STAGE") return { wantStage: true };
  if (type === "ALTERNANCE") return { wantAlternance: true };
  return undefined;
}

export async function GET(request: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "EMPLOI" | "STAGE" | "ALTERNANCE" | null;

    const typeFilter = contractTypeFilter(type);

    const seekers = await prisma.jobSeeker.findMany({
      where: {
        status: "ACTIVE",
        ...typeFilter,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(seekers);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePlatformPermission("jobs:seek");
    const body = await request.json();
    const data = createSeekerSchema.parse(body);

    const seeker = await prisma.jobSeeker.create({
      data: {
        ...data,
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        authorId: session.user.id!,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    void notifySeekerSubscribers(seeker).catch(() => null);

    return successResponse(seeker, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifySeekerSubscribers(seeker: {
  id: string;
  title: string;
  author: { name: string | null; displayName: string | null };
}) {
  const subs = await prisma.jobNotificationSubscription.findMany({
    where: { wantSeekers: true },
    select: { userId: true, inApp: true, email: true },
  });

  const authorName = seeker.author.displayName ?? seeker.author.name ?? "Quelqu'un";

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.inApp) {
        await createNotification({
          userId:  sub.userId,
          domain:  "jobs",
          type:    "JOB_SEEKER",
          title:   "Nouveau profil en recherche",
          message: `${authorName} cherche un emploi : « ${seeker.title} »`,
          link:    `/jobs/seekers/${seeker.id}`,
        });
      }
    })
  );
}
