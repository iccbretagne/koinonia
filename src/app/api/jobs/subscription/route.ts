import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { subSchema } from "./contract";

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
