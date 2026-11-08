import { successResponse, errorResponse } from "@/lib/api-utils";
import { listJustifications } from "@/modules/accounting";
import { listQuerySchema } from "./contract";
import { requireJustificationViewer } from "./_viewer";

export async function GET(request: Request) {
  try {
    const viewer = await requireJustificationViewer();
    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await listJustifications(viewer, { status: query.status, open: query.open === "1" }));
  } catch (error) {
    return errorResponse(error);
  }
}
