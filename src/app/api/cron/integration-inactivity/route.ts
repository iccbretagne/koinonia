import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { runInactivityNotifications } from "@/modules/integration";

function authorizeCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw new ApiError(401, "Unauthorized");
  }
}

export async function POST(request: Request) {
  try {
    authorizeCron(request);
    const appUrl = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
    const result = await runInactivityNotifications(appUrl);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
