import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

const createSeekerSchema = z
  .object({
    title:          z.string().min(1).max(200),
    wantEmploi:     z.boolean().default(false),
    wantStage:      z.boolean().default(false),
    wantAlternance: z.boolean().default(false),
    sector:         z.string().max(150).optional().nullable(),
    location:       z.string().max(150).optional().nullable(),
    remote:         z.boolean().default(false),
    availableFrom:  z.string().datetime().optional().nullable(),
    description:    z.string().min(1),
    contactEmail:   z.string().email().max(150).optional().nullable(),
    contactUrl:     z.string().url().max(500).optional().nullable(),
  })
  .refine((d) => d.wantEmploi || d.wantStage || d.wantAlternance, {
    message: "Au moins un type de contrat doit être sélectionné",
  });

export async function GET(request: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "EMPLOI" | "STAGE" | "ALTERNANCE" | null;

    const typeFilter =
      type === "EMPLOI"
        ? { wantEmploi: true }
        : type === "STAGE"
          ? { wantStage: true }
          : type === "ALTERNANCE"
            ? { wantAlternance: true }
            : undefined;

    const seekers = await prisma.jobSeeker.findMany({
      where: {
        status: "ACTIVE",
        ...(typeFilter ?? {}),
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
    const session = await requirePermission("jobs:seek");
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
        await prisma.notification.create({
          data: {
            userId:  sub.userId,
            type:    "JOB_SEEKER",
            title:   "Nouveau profil en recherche",
            message: `${authorName} cherche un emploi : « ${seeker.title} »`,
            link:    `/jobs/seekers/${seeker.id}`,
          },
        });
      }
    })
  );
}
