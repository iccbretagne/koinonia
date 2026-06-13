import { requirePermission } from "@/lib/auth";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

const FAMILLES_URL =
  process.env.FAMILLES_URL ?? "https://familles.iccrennes.fr";

export async function GET(_request: Request) {
  try {
    await requirePermission("events:manage");

    const res = await fetch(`${FAMILLES_URL}/api/geojson`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new ApiError(502, "Impossible de récupérer les familles");

    const raw: unknown = await res.json();

    // The external API may return either a plain array or { families: [...] }
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown>).families)
        ? (raw as { families: unknown[] }).families
        : [];

    const families = items
      .map((f) => {
        const item = f as Record<string, unknown>;
        return { id: Number(item.id), name: String(item.name ?? "") };
      })
      .filter((f) => f.id && f.name)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return successResponse({ families });
  } catch (error) {
    return errorResponse(error);
  }
}
