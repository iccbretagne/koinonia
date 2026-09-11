import { redirect, notFound } from "next/navigation";
import { requireAuth, getCurrentChurchId } from "@/lib/auth";
import { resolveMediaSpaceAccess, buildMediaSpaceTabs } from "@/lib/media-space";

/** `/media` redirige vers le premier onglet accessible (spec 043, calqué sur `/audio`). */
export default async function MediaIndexPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);

  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const access = await resolveMediaSpaceAccess(session, churchId);
  const tabs = buildMediaSpaceTabs(access);
  const first = tabs[0];
  if (!first) notFound();

  redirect(first.href);
}
