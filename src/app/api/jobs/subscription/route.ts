import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { z } from "zod";

export async function GET() {
  try {
    const session = await requireAuth();

    const sub = await prisma.jobNotificationSubscription.upsert({
      where:  { userId: session.user.id! },
      create: { userId: session.user.id! },
      update: {},
    });

    return successResponse(sub);
  } catch (error) {
    return errorResponse(error);
  }
}

const subSchema = z.object({
  inApp:                 z.boolean().optional(),
  email:                 z.boolean().optional(),
  wantEmploi:            z.boolean().optional(),
  wantStage:             z.boolean().optional(),
  wantAlternance:        z.boolean().optional(),
  wantSeekers:           z.boolean().optional(),
  wantFreelanceMissions: z.boolean().optional(),
  wantFreelanceProfiles: z.boolean().optional(),
});

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const data = subSchema.parse(body);

    const sub = await prisma.jobNotificationSubscription.upsert({
      where:  { userId: session.user.id! },
      create: { userId: session.user.id!, ...data },
      update: data,
    });

    return successResponse(sub);
  } catch (error) {
    return errorResponse(error);
  }
}
