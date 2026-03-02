import AuditLogsClient from "./AuditLogsClient";

export default function AuditLogsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Historique des modifications
      </h1>
      <AuditLogsClient />
    </div>
  );
}
