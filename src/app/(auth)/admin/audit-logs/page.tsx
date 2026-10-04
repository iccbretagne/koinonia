import { requireAuth, getCurrentChurchId, requireChurchPermission } from "@/lib/auth";
import AuditLogsClient from "./AuditLogsClient";

/** Historique des modifications de l'église courante (`church:settings` : Admin et Super Admin). */
export default async function AuditLogsPage() {
  const session = await requireAuth();
  const churchId = await getCurrentChurchId(session);
  if (!churchId) return <p>Aucune église sélectionnée.</p>;
  await requireChurchPermission("church:settings", churchId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-6">
        Historique des modifications
      </h1>
      <AuditLogsClient />
    </div>
  );
}
