import { prisma } from "@/lib/prisma";
import { requireAuth, requirePermission } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { sendEmail, buildJobOfferEmail } from "@/lib/email";
import { z } from "zod";

const jobSchema = z.object({
  title:        z.string().min(1).max(200),
  type:         z.enum(["EMPLOI", "STAGE", "ALTERNANCE"]),
  company:      z.string().min(1).max(150),
  location:     z.string().max(150).optional().nullable(),
  description:  z.string().min(1),
  duration:     z.string().max(100).optional().nullable(),
  deadline:     z.string().datetime().optional().nullable(),
  contactEmail: z.string().email().max(150).optional().nullable(),
  contactUrl:   z.string().url().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const type   = searchParams.get("type");
    const status = searchParams.get("status") ?? "PUBLISHED";

    const now = new Date();

    const jobs = await prisma.jobOffer.findMany({
      where: {
        status: status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
        ...(type ? { type: type as "EMPLOI" | "STAGE" | "ALTERNANCE" } : {}),
        ...(status !== "ARCHIVED" ? { OR: [{ deadline: null }, { deadline: { gte: now } }] } : {}),
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(jobs);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("jobs:post");
    const body = await request.json();
    const data = jobSchema.parse(body);

    const job = await prisma.jobOffer.create({
      data: {
        ...data,
        deadline:  data.deadline  ? new Date(data.deadline)  : null,
        authorId:  session.user.id!,
      },
      include: {
        author: { select: { id: true, name: true, displayName: true, image: true } },
      },
    });

    // Fire-and-forget notifications
    void notifySubscribers(job).catch(() => null);

    return successResponse(job, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

async function notifySubscribers(job: {
  id: string;
  title: string;
  type: "EMPLOI" | "STAGE" | "ALTERNANCE";
  company: string;
  location: string | null;
  duration: string | null;
  deadline: Date | null;
  description: string;
  contactEmail: string | null;
  contactUrl: string | null;
}) {
  const typeField =
    job.type === "EMPLOI"
      ? { wantEmploi: true }
      : job.type === "STAGE"
        ? { wantStage: true }
        : { wantAlternance: true };

  const subs = await prisma.jobNotificationSubscription.findMany({
    where: typeField,
    include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
  });

  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const jobUrl = `${appUrl}/jobs/${job.id}`;

  const typeLabel = job.type === "EMPLOI" ? "Emploi" : job.type === "STAGE" ? "Stage" : "Alternance";

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.inApp) {
        await prisma.notification.create({
          data: {
            userId:  sub.userId,
            type:    "JOB_OFFER",
            title:   `Nouvelle offre ${typeLabel}`,
            message: `${job.title} chez ${job.company}`,
            link:    `/jobs/${job.id}`,
          },
        });
      }
      if (sub.email && sub.user.email) {
        const { subject, html } = buildJobOfferEmail({
          subscriberName: sub.user.displayName ?? sub.user.name ?? null,
          jobTitle:       job.title,
          company:        job.company,
          type:           job.type,
          location:       job.location,
          duration:       job.duration,
          deadline:       job.deadline,
          description:    job.description,
          contactEmail:   job.contactEmail,
          contactUrl:     job.contactUrl,
          jobUrl,
        });
        await sendEmail({ to: sub.user.email, subject, html });
      }
    })
  );
}
