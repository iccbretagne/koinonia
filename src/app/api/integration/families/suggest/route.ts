import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { geocodeAddress, findFamilyByCoords } from "@/lib/family-geo";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address) throw new ApiError(400, "address requis");

    const geo = await geocodeAddress(address);
    if (!geo) return successResponse({ familyId: null, familyName: null });

    const family = await findFamilyByCoords(geo.lat, geo.lng);
    return successResponse({
      familyId: family?.familyId ?? null,
      familyName: family?.familyName ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
