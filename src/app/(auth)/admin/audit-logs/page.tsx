import { requirePermission } from "@/lib/auth";
import AuditLogsClient from "./AuditLogsClient";

export default async function AuditLogsPage() {
  await requirePermission("church:manage");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Historique des modifications
      </h1>
      <AuditLogsClient />
    </div>
  );
}
