import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getMcpInstanceSettings, mcpUsageStats } from "@/modules/mcp";
import McpAdminClient from "./McpAdminClient";

/**
 * Assistants IA (MCP, spec 081) — réglage de plateforme : interrupteur d'instance et activité
 * par église (connexions actives, appels sur 30 jours), jamais de contenu.
 */
export default async function McpAdminPage() {
  await requireSuperAdmin();
  const [settings, usage] = await Promise.all([getMcpInstanceSettings(), mcpUsageStats()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administration · Plateforme"
        title="Assistants IA (MCP)"
        description="Connexion des assistants IA des membres à Koinonia : lecture, et deux actions confirmées par la personne si elle les autorise. Chaque église l'active ensuite dans ses paramètres."
      />
      <McpAdminClient enabled={settings.enabled} usage={usage} />
    </div>
  );
}
