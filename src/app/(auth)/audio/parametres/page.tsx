import Link from "next/link";
import { requireAuth, requireAudioAccess, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedStreamUrl } from "@/modules/storage";
import { listOutgoingShares } from "@/modules/audio";
import AudioSettingsClient from "./AudioSettingsClient";
import LibrarySharingClient from "./LibrarySharingClient";

export default async function AudioSettingsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireAudioAccess("audio:manage", churchId);

  const settings = await prisma.audioSettings.findUnique({ where: { churchId } });

  const coverPreviewUrl = settings?.defaultCoverKey
    ? await getSignedStreamUrl(settings.defaultCoverKey)
    : null;

  // Le partage de bibliothèque reste réservé à Super Admin/Admin (spec 036) — pas de
  // passe-droit équipe de captation, contrairement à l'accès à cette page.
  const { rolePermissions } = await import("@/lib/registry");
  const canManageSharing =
    session.user.isSuperAdmin ||
    session.user.churchRoles
      .filter((r) => r.churchId === churchId)
      .some((r) => (rolePermissions[r.role] ?? []).includes("audio:manage"));

  const church = canManageSharing
    ? await prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } })
    : null;
  const outgoingShares = canManageSharing ? await listOutgoingShares(churchId) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Audio — Paramètres</h1>
      <p className="text-sm text-gray-500 mb-6">
        Le département de captation audio se configure désormais parmi les{" "}
        <Link href="/admin/departments/functions" className="text-icc-violet underline">
          fonctions départementales
        </Link>{" "}
        (fonction « Captation Audio »).
      </p>
      <AudioSettingsClient
        settings={
          settings
            ? {
                defaultCoverKey: settings.defaultCoverKey,
                sequenceTemplate: Array.isArray(settings.sequenceTemplate)
                  ? (settings.sequenceTemplate as unknown[]).filter((n): n is string => typeof n === "string")
                  : [],
              }
            : { defaultCoverKey: null, sequenceTemplate: [] }
        }
        coverPreviewUrl={coverPreviewUrl}
      />

      {canManageSharing && church && (
        <LibrarySharingClient
          ownSlug={church.slug}
          initialShares={outgoingShares.map((s) => ({
            id: s.id,
            churchName: s.churchName,
            churchSlug: s.churchSlug,
            createdAt: s.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
