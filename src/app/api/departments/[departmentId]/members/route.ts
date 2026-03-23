import { prisma } from "@/lib/prisma";
import { requireChurchPermission, resolveChurchId } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ departmentId: string }> }
) {
  try {
    const { departmentId } = await params;
    const churchId = await resolveChurchId("department", departmentId);
    await requireChurchPermission("members:view", churchId);

    const members = await prisma.member.findMany({
      where: { departments: { some: { departmentId } } },
      orderBy: { lastName: "asc" },
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}
