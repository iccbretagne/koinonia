import {
  requireAuth,
  getCurrentChurchId,
  requireMediaGalleryAccess,
  requireMediaGalleryGrantAccess,
  getMediaShareScope,
} from "@/lib/auth";
import { resolveMediaSpaceAccess } from "@/lib/media-space";
import { listLibraryItems } from "@/modules/media";
import { libraryQuerySchema } from "@/app/api/media/library/contract";
import { toGalleryFilters } from "@/app/api/media/library/_filters";
import GalleryClient from "./GalleryClient";

/**
 * Galerie médias (spec 080) : tous les médias validés de l'église, filtrables et triables.
 * Les filtres vivent dans l'adresse ; la première page est rendue côté serveur.
 */
export default async function GalleryPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  let grantOnly: boolean;
  try {
    ({ grantOnly } = await requireMediaGalleryAccess(churchId));
  } catch {
    return <p className="text-sm text-ink-muted">Aucun accès à la galerie.</p>;
  }

  const raw = Object.fromEntries(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
  );
  const parsed = libraryQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : libraryQuerySchema.parse({});
  const { cursor: _cursor, limit: _limit, ...filters } = query;

  const [page, access, shareScope, canManageGrants] = await Promise.all([
    listLibraryItems(churchId, toGalleryFilters(filters), undefined),
    resolveMediaSpaceAccess(session, churchId),
    getMediaShareScope(session, churchId),
    requireMediaGalleryGrantAccess(churchId).then(() => true, () => false),
  ]);

  const canShare = !grantOnly && access.share;
  const queryKey = JSON.stringify(filters);

  return (
    <GalleryClient
      key={queryKey}
      churchId={churchId}
      filters={filters}
      initialPage={page}
      canShare={canShare}
      shareScope={{ photos: shareScope.photos, visuals: shareScope.visuels }}
      originAccess={{ photos: access.photos, visuals: access.visuals }}
      canManageGrants={canManageGrants}
    />
  );
}
