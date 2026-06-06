import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { requireIntegrationAccess } from "@/lib/auth";

const FAMILIES_API_URL =
  process.env.FAMILIES_API_URL ?? "https://familles.iccrennes.fr";

interface FamilyFeature {
  properties: {
    id?: number;
    familyId?: number;
    name?: string;
    familyName?: string;
    [key: string]: unknown;
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");

    await requireIntegrationAccess(churchId);

    const res = await fetch(`${FAMILIES_API_URL}/api/geojson`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Impossible de récupérer les familles");

    const geojson = await res.json();
    const families: { id: number; name: string }[] = (geojson.features ?? [])
      .map((f: FamilyFeature) => ({
        id: Number(f.properties.familyId ?? f.properties.id),
        name: String(f.properties.familyName ?? f.properties.name ?? ""),
      }))
      .filter((f: { id: number; name: string }) => f.id && f.name)
      .sort((a: { id: number; name: string }, b: { id: number; name: string }) =>
        a.name.localeCompare(b.name, "fr")
      );

    return successResponse({ families });
  } catch (error) {
    return errorResponse(error);
  }
}
