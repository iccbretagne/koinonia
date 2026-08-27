import { requirePermission, getCurrentChurchId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedStreamUrl } from "@/modules/storage";
import AudioSettingsClient from "./AudioSettingsClient";

export default async function AudioSettingsPage() {
  const session = await requirePermission("audio:manage");
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;

  const [settings, departments] = await Promise.all([
    prisma.audioSettings.findUnique({ where: { churchId } }),
    prisma.department.findMany({
      where: { ministry: { churchId } },
      select: { id: true, name: true, ministry: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const coverPreviewUrl = settings?.defaultCoverKey
    ? await getSignedStreamUrl(settings.defaultCoverKey)
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audio — Paramètres</h1>
      <AudioSettingsClient
        settings={
          settings
            ? {
                captureDepartmentId: settings.captureDepartmentId,
                defaultCoverKey: settings.defaultCoverKey,
                sequenceTemplate: Array.isArray(settings.sequenceTemplate)
                  ? (settings.sequenceTemplate as unknown[]).filter((n): n is string => typeof n === "string")
                  : [],
              }
            : { captureDepartmentId: null, defaultCoverKey: null, sequenceTemplate: [] }
        }
        departments={departments.map((d) => ({ id: d.id, label: `${d.name} (${d.ministry.name})` }))}
        coverPreviewUrl={coverPreviewUrl}
      />
    </div>
  );
}
