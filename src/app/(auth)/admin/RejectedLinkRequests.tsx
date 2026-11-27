"use client";

import { useState } from "react";
import { ChevronRight, Undo2 } from "lucide-react";
import { Button, StatusChip, buttonClasses } from "@/components/ui";

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9`}
      >
        <ChevronRight aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={1.75} />
        {open ? "Masquer" : "Afficher"} {rejected.length > 1 ? `les ${rejected.length} demandes refusées` : "la demande refusée"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rejected.map((r) => {
            const name = r.member
              ? `${r.member.firstName} ${r.member.lastName}`
              : `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
            return (
              <div key={r.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-muted truncate">{r.user.name ?? r.user.email}</p>
                    {name && (
                      <p className="truncate text-[13px] text-ink-muted">{r.member ? "STAR : " : "Nouveau : "}{name}</p>
                    )}
                    {r.requestedRole && (
                      <StatusChip className="mt-1">{roleLabels[r.requestedRole] ?? r.requestedRole}</StatusChip>
                    )}
                  </div>
                  <span className="shrink-0 text-[13px] text-ink-muted">
                    {r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("fr-FR") : "—"}
                  </span>
                </div>
                {r.rejectReason && (
                  <p className="mt-1.5 text-[13px] italic text-ink-muted">&ldquo;{r.rejectReason}&rdquo;</p>
                )}
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => onReconsider(r)}
                    disabled={busyId === r.id}
                  >
                    <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    {busyId === r.id ? "Reconsidération…" : "Reconsidérer"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
