import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { listUserConnections, resourceUrl } from "@/modules/mcp";
import AssistantsClient from "./AssistantsClient";

/**
 * Mon profil › Assistants connectés (spec 081) : adresse à donner à son assistant IA, mode
 * d'emploi court, connexions actives et révocation.
 */
export default async function ConnectedAssistantsPage() {
  const session = await requireAuth();
  const connections = await listUserConnections(session.user.id);
  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <PageHeader
        eyebrow="Mon profil"
        title="Assistants connectés"
        description="Connectez votre assistant IA (Claude, ChatGPT…) : il pourra lire ce que vous voyez déjà dans Koinonia, sans rien modifier."
      />
      <AssistantsClient serverUrl={resourceUrl()} initial={connections} />
    </div>
  );
}
