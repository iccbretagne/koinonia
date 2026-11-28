"use client";

import { useState } from "react";
import { Button, ConfirmModal, EmptyState, StatusChip } from "@/components/ui";
import type { DomainRow } from "@/modules/ticketing";
import { useApi } from "@/app/(auth)/evenements/billetterie/use-api";

const STATUS = {
  PENDING: { label: "DNS non vérifié", tone: "warning" },
  VERIFIED: { label: "À approuver", tone: "info" },
  APPROVED: { label: "Approuvé", tone: "success" },
  SUSPENDED: { label: "Suspendu", tone: "danger" },
} as const;

export default function SiteDomainsClient({ domains }: { readonly domains: DomainRow[] }) {
  const { call, busy } = useApi();
  const [rejecting, setRejecting] = useState<DomainRow | null>(null);
  if (domains.length === 0) return <EmptyState title="Aucune demande" description="Aucun domaine dédié n'a été demandé." />;
  const decide = (id: string, decision: "approve" | "reject") => call(`/api/ticketing/site-domains/${id}`, "PATCH", { decision }, decision === "approve" ? "Domaine approuvé" : "Demande refusée");
  return (
    <>
      <ul className="flex flex-col gap-3">
        {domains.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{d.host}</span>
              <StatusChip tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusChip>
            </div>
            <p className="text-[13px] text-ink-muted">{d.churchName} · {d.eventTitle} · adresse {d.siteSlug}</p>
            {d.lastError && <p className="text-[13px] text-danger">{d.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              {d.status === "VERIFIED" && <Button type="button" variant="secondary" disabled={busy} onClick={() => decide(d.id, "approve")}>Approuver le domaine</Button>}
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(d)}>Refuser et supprimer</Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmModal
        open={rejecting !== null}
        title={`Refuser le domaine ${rejecting?.host ?? ""} ?`}
        message="La demande est supprimée : l'organisateur devra en déposer une nouvelle."
        confirmLabel="Refuser et supprimer"
        confirmingLabel="Suppression…"
        confirming={busy}
        onConfirm={async () => {
          if (!rejecting) return;
          await decide(rejecting.id, "reject");
          setRejecting(null);
        }}
        onCancel={() => setRejecting(null)}
      />
    </>
  );
}
