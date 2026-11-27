"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, EmptyState, SkeletonList, StatusChip, type StatusTone } from "@/components/ui";

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    displayName: string | null;
    email: string;
  };
}

const ACTION_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  CREATE: { label: "Création", tone: "success" },
  UPDATE: { label: "Modification", tone: "info" },
  DELETE: { label: "Suppression", tone: "danger" },
  EXPORT: { label: "Export", tone: "brand" },
  VIEW: { label: "Consultation", tone: "neutral" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?page=${page}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    void fetchLogs();
  }, [fetchLogs]);

  function getUserName(user: AuditLogEntry["user"]) {
    return user.displayName || user.name || user.email;
  }

  if (loading) {
    return <SkeletonList rows={6} />;
  }

  if (logs.length === 0) {
    return <EmptyState title="Aucune entrée dans l'historique" />;
  }

  return (
    <div>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-sunken border-b border-line">
              <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Date</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Utilisateur</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Action</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Type</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold text-ink-muted">Détails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((log) => {
              const actionInfo = ACTION_LABELS[log.action] || {
                label: log.action,
                tone: "neutral" as StatusTone,
              };
              return (
                <tr key={log.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">
                    {getUserName(log.user)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip tone={actionInfo.tone}>{actionInfo.label}</StatusChip>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">
                    {log.entityType}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-[13px] text-ink-muted">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </Button>
          <span className="text-sm text-ink-muted">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
