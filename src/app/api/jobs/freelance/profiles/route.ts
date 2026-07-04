import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const modalityEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

const createProfileSchema = z.object({
  title:         z.string().min(1).max(200),
  domain:        z.string().min(1).max(150),
  dailyRate:     z.string().max(100).optional().nullable(),
  hourlyRate:    z.string().max(100).optional().nullable(),
  modality:      modalityEnum.default("REMOTE"),
  location:      z.string().max(150).optional().nullable(),
  availableFrom: z.string().datetime().optional().nullable(),
  description:   z.string().min(1),
  contactEmail:  z.string().email().max(150).optional().nullable(),
  contactUrl:    z.string().url().max(500).optional().nullable(),
});

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
    const session = await requirePermission("jobs:freelance");
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
        await prisma.notification.create({
          data: {
            userId:  sub.userId,
            type:    "FREELANCE_PROFILE",
            title:   "Nouveau freelance disponible",
            message: `${authorName} propose ses services : « ${profile.title} »`,
            link:    `/jobs/freelance/profiles/${profile.id}`,
          },
        });
      }
    })
  );
}
