import { resolveChurchId } from "@/lib/auth";
import { errorResponse } from "@/lib/api-utils";
import { getApplicationPhoto } from "@/modules/serving";
import { requireServingActor } from "@/modules/serving/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireServingActor(await resolveChurchId("servingApplication", id));
    const photo = await getApplicationPhoto(actor, id);
    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
