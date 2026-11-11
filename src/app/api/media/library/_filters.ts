import type { GalleryFilters } from "@/modules/media";
import type { LibraryQuery } from "./contract";

/** Traduit les filtres de l'adresse (spec 080) en filtres du service. */
export function toGalleryFilters(query: Omit<LibraryQuery, "cursor" | "limit">): GalleryFilters {
  const [sourceType, sourceId] = query.source ? (query.source.split(":") as ["event" | "project", string]) : [];
  return {
    type: query.type,
    from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
    to: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
    sourceType,
    sourceId,
    q: query.q || undefined,
    order: query.order,
  };
}
