import { successResponse, errorResponse } from "@/lib/api-utils";
import { listLabels, markPrinted } from "@/modules/ticketing";
import { requireEventAction } from "@/modules/ticketing/auth";
import { labelsQuerySchema, markPrintedSchema } from "./contract";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireEventAction(id, "catering");
    const query = labelsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return successResponse(await listLabels(id, query.set, query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireEventAction(id, "catering");
    const { itemIds } = markPrintedSchema.parse(await request.json());
    return successResponse(await markPrinted(id, itemIds));
  } catch (error) {
    return errorResponse(error);
  }
}
