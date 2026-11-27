import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import AuditLogsClient from "./AuditLogsClient";
import { PageHeader } from "@/components/ui";

/** Historique des modifications de l'église courante (`church:settings` : Admin et Super Admin). */
export default async function AuditLogsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p className="text-ink-muted">Aucune église sélectionnée.</p>;
  await requireChurchPermission("church:settings", churchId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Historique des modifications" />
      <AuditLogsClient />
    </div>
  );
}
