import { getCurrentChurchId, requireAuth, requireChurchPermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getAudienceOptions } from "@/modules/messages";
import MessageForm from "../MessageForm";

/** Nouveau message système (spec 071). */
export default async function NewSystemMessagePage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("messages:publish", churchId);
  const options = await getAudienceOptions(churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Messages système" title="Nouveau message" />
      <MessageForm churchId={churchId} isSuperAdmin={Boolean(session.user.isSuperAdmin)} options={options} />
    </div>
  );
}
