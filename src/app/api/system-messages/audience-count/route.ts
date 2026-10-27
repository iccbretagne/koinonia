import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRateLimit, RATE_LIMIT_MUTATION } from "@/lib/rate-limit";
import { countAudience } from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";
import { audienceCountSchema } from "./contract";

export async function POST(request: Request) {
  try {
    const input = audienceCountSchema.parse(await request.json());
    const churchId = input.scope === "church" ? input.churchId : null;
    const session = await requireMessageAuthorAccess(churchId);
    requireRateLimit(request, { prefix: `system-messages:count:${session.user.id}`, ...RATE_LIMIT_MUTATION });
    return successResponse(await countAudience({ churchId, audience: input.audience }));
  } catch (error) {
    return errorResponse(error);
  }
}
