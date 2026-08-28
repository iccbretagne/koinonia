import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";
import { geocodeAddress, findFamilyByCoords } from "@/lib/family-geo";
import { requireRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    requireRateLimit(request, { prefix: `integration-families-suggest:public:${getClientIp(request)}`, windowMs: 60_000, max: 20 });

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
