import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/modules/integration";

const FAMILLES_URL =
  process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

interface FamilyItem {
  id: number;
  name: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireIntegrationAccess(churchId);

    const res = await fetch(`${FAMILLES_URL}/api/geojson`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Impossible de récupérer les familles");

    const data: FamilyItem[] = await res.json();
    const families = (Array.isArray(data) ? data : [])
      .map((f) => ({ id: Number(f.id), name: String(f.name ?? "") }))
      .filter((f) => f.id && f.name)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return successResponse({ families });
  } catch (error) {
    return errorResponse(error);
  }
}
