"use client";

import { useState } from "react";
import { Alert, Button, Input, StatusChip } from "@/components/ui";
import type { DomainView } from "@/modules/ticketing";
import { useApi } from "../../use-api";

const STATUS = {
  PENDING: { label: "En attente de vérification DNS", tone: "warning" },
  VERIFIED: { label: "DNS vérifié, en attente d'approbation", tone: "info" },
  APPROVED: { label: "Approuvé : le site est servi sur ce domaine", tone: "success" },
  SUSPENDED: { label: "Suspendu : le DNS ne répond plus", tone: "danger" },
} as const;

/** Domaine dédié du site (spec 084) : demande, enregistrements DNS à créer, vérification. Organisateur seulement. */
export default function DomainCard({ eventId, domain }: { readonly eventId: string; readonly domain: DomainView | null }) {
  const { call, busy } = useApi();
  const [host, setHost] = useState("");
  const base = `/api/ticketing/events/${eventId}/site/domain`;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-ink">Domaine dédié</h2>
      {!domain ? (
        <>
          <p className="text-[13px] text-ink-muted">Servez le site sur votre propre domaine (par exemple fete.exemple.org). Le domaine doit être vérifié par DNS puis approuvé par l&apos;administration de la plateforme.</p>
          <Input label="Domaine" value={host} placeholder="fete.exemple.org" onChange={(e) => setHost(e.target.value)} />
          <Button type="button" disabled={busy || host.trim().length < 3} onClick={async () => { if (await call(base, "POST", { host }, "Domaine demandé")) setHost(""); }}>Demander ce domaine</Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{domain.host}</span>
            <StatusChip tone={STATUS[domain.status].tone}>{STATUS[domain.status].label}</StatusChip>
          </div>
          {domain.lastError && <Alert tone="warning" title="Dernier contrôle.">{domain.lastError}</Alert>}
          {(domain.status === "PENDING" || domain.status === "SUSPENDED") && (
            <>
              <p className="text-[13px] text-ink-muted">Créez ces deux enregistrements chez votre hébergeur DNS, puis cliquez sur « Vérifier le DNS » (la propagation peut prendre quelques minutes).</p>
              <ul className="space-y-2 text-[13px] text-ink">
                {domain.records.map((r) => (
                  <li key={r.type} className="rounded-chip border border-line p-2"><strong>{r.type}</strong> · <code className="break-all">{r.name}</code> → <code className="break-all">{r.value}</code></li>
                ))}
              </ul>
              <Button type="button" disabled={busy} onClick={() => call(`${base}/verify`, "POST", undefined, undefined)}>{busy ? "Vérification en cours…" : "Vérifier le DNS"}</Button>
            </>
          )}
          <Button type="button" variant="secondary" disabled={busy} onClick={() => call(base, "DELETE", undefined, "Domaine supprimé")}>Supprimer le domaine</Button>
        </>
      )}
    </section>
  );
}
