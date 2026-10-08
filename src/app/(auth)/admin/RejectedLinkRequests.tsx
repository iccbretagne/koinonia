"use client";

import { useState } from "react";

export interface RejectedLinkRequest {
  id: string;
  user: { name: string | null; email: string };
  member: { firstName: string; lastName: string } | null;
  firstName: string | null;
  lastName: string | null;
  requestedRole: string | null;
  rejectReason: string | null;
  reviewedAt: string | null;
}

interface Props<T extends RejectedLinkRequest> {
  readonly rejected: T[];
  readonly roleLabels: Record<string, string>;
  /** Demande en cours de reconsidération (bouton désactivé). */
  readonly busyId: string | null;
  readonly onReconsider: (request: T) => void;
  readonly className?: string;
}

/** Demandes de rattachement refusées, repliées par défaut, chacune reconsidérable. */
export default function RejectedLinkRequests<T extends RejectedLinkRequest>({
  rejected,
  roleLabels,
  busyId,
  onReconsider,
  className = "mt-2",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  if (rejected.length === 0) return null;

  return (
    <div className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink-muted transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Demandes refusées ({rejected.length})
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rejected.map((r) => {
            const name = r.member
              ? `${r.member.firstName} ${r.member.lastName}`
              : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
            return (
              <div key={r.id} className="border border-line rounded-lg p-3 bg-surface-sunken">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-muted truncate">{r.user.name ?? r.user.email}</p>
                    {name && (
                      <p className="text-xs text-ink-muted truncate">{r.member ? "STAR : " : "Nouveau : "}{name}</p>
                    )}
                    {r.requestedRole && (
                      <span className="inline-block mt-1 text-xs bg-surface-sunken text-ink-muted px-1.5 py-0.5 rounded">
                        {roleLabels[r.requestedRole] ?? r.requestedRole}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-subtle shrink-0">
                    {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                {r.rejectReason && (
                  <p className="mt-1.5 text-xs text-ink-muted italic">&ldquo;{r.rejectReason}&rdquo;</p>
                )}
                <div className="mt-2">
                  <button
                    onClick={() => onReconsider(r)}
                    disabled={busyId === r.id}
                    className="text-xs text-brand-text border border-brand/30 rounded-lg px-2.5 py-1 hover:bg-brand-soft disabled:opacity-50 transition-colors"
                  >
                    {busyId === r.id ? "En cours…" : "↩ Reconsidérer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
