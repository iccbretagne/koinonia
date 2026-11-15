import { ApiError, errorResponse, successResponse } from "@/lib/api-utils";
import { getClientIp, requireRateLimit } from "@/lib/rate-limit";
import { bookSlot, cancelInterview, declineSlots, findApplicationIdByToken, publicInterviewView } from "@/modules/serving";
import { publicInterviewActionSchema } from "./contract";

type Params = { params: Promise<{ token: string }> };

const NOT_FOUND = "Ce lien ne mène à aucun rendez-vous.";

async function load(request: Request, params: Params["params"]) {
  requireRateLimit(request, { prefix: `serving-interview:${getClientIp(request)}`, windowMs: 60_000, max: 30 });
  const { token } = await params;
  const app = await findApplicationIdByToken(token);
  if (!app) throw new ApiError(404, NOT_FOUND);
  return app;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const app = await load(request, params);
    return successResponse(await publicInterviewView(app.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const app = await load(request, params);
    const body = publicInterviewActionSchema.parse(await request.json().catch(() => ({})));
    if (body.action === "book") await bookSlot(app.id, body.slotId, { byCandidate: true });
    else if (body.action === "decline") await declineSlots(app.id);
    else await cancelInterview(app.id, "CANDIDATE", { required: true });
    return successResponse(await publicInterviewView(app.id));
  } catch (error) {
    return errorResponse(error);
  }
}
