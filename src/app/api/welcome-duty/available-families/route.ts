import { requireCurrentChurchPermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const FAMILLES_URL =
  process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

export async function GET(_request: Request) {
  try {
    await requireCurrentChurchPermission("events:manage");

    const res = await fetch(`${FAMILLES_URL}/api/geojson`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Impossible de récupérer les familles");

    const raw: unknown = await res.json();

    // The external API may return either a plain array or { families: [...] }
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (Array.isArray((raw as Record<string, unknown>).families)) {
      items = (raw as { families: unknown[] }).families;
    }

    const families = items
      .map((f) => {
        const item = f as Record<string, unknown>;
        return { id: Number(item.id), name: typeof item.name === "string" ? item.name : "" };
      })
      .filter((f) => f.id && f.name)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return successResponse({ families });
  } catch (error) {
    return errorResponse(error);
  }
}
