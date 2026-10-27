import { notFound, redirect } from "next/navigation";
import { getCurrentChurchId, requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getAudienceOptions, getMessageChurchId, getMessageForAuthor } from "@/modules/messages";
import { requireMessageAuthorAccess } from "@/modules/messages/auth";
import MessageForm from "../MessageForm";

/** Correction d'un message système (spec 071) : l'église qui fait foi est celle du message. */
export default async function EditSystemMessagePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  const churchId = await getMessageChurchId(id).catch(() => notFound());
  const allowed = await requireMessageAuthorAccess(churchId).then(
    () => true,
    () => false
  );
  if (!allowed) redirect("/admin/messages");

  const message = await getMessageForAuthor(id);
  if (message.status === "past") redirect("/admin/messages?etat=passes");
  const optionsChurchId = churchId ?? (await getCurrentChurchId(session));
  const options = optionsChurchId ? await getAudienceOptions(optionsChurchId) : { ministries: [] };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Messages système"
        title="Modifier le message"
        description={`Visées : ${message.stats.recipients ?? "—"} · vues : ${message.stats.seen} · fermées : ${message.stats.dismissed}`}
      />
      <MessageForm
        churchId={optionsChurchId ?? ""}
        isSuperAdmin={Boolean(session.user.isSuperAdmin)}
        options={options}
        message={message}
      />
    </div>
  );
}
