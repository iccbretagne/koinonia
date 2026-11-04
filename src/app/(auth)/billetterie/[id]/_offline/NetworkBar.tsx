"use client";

import { Wifi, WifiOff } from "lucide-react";
import type { FieldStatus } from "./use-field-sync";

/** Bandeau d'état du réseau : en ligne ou non, opérations en attente, dernière mise à jour. */
export default function NetworkBar({ status }: { readonly status: FieldStatus }) {
  const time = status.lastSync ? new Date(status.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  return (
    <output
      className={`flex flex-wrap items-center justify-between gap-2 rounded-control px-3 py-2 text-[13px] ${status.online ? "bg-success-soft text-ink" : "bg-warning-soft text-ink"}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        {status.online ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
        {status.online ? "En ligne" : "Hors ligne — les opérations sont gardées sur ce téléphone"}
      </span>
      <span>
        {status.pending > 0 ? `${status.pending} en attente · ` : ""}mis à jour {time}
      </span>
      {status.error && <span className="w-full text-danger">{status.error}</span>}
    </output>
  );
}
