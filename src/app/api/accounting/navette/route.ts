import { errorResponse, successResponse } from "@/lib/api-utils";
import { getLedger } from "@/modules/shuttle";
import { ledgerQuerySchema } from "@/modules/shuttle/schemas";
import { currentChurchAccess } from "./_shared";

export async function GET(request: Request) {
  try {
    const { churchId, session, manager } = await currentChurchAccess();
    const query = ledgerQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await getLedger(churchId, query, { userId: session.user.id!, manager }));
  } catch (error) {
    return errorResponse(error);
  }
}
