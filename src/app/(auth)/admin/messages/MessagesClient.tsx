"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, DataTable, EmptyState, StatusChip, useToast } from "@/components/ui";
import type { StatusTone } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/roles";
import type { MessageListItem, MessageStatus } from "@/modules/messages";
import { SEVERITY_LABEL, type Audience } from "@/modules/messages/schemas";

const SEVERITY_TONE: Record<MessageListItem["severity"], StatusTone> = {
  INFO: "info",
  IMPORTANT: "warning",
  URGENT: "danger",
};

const EMPTY: Record<MessageStatus, string> = {
  active: "Aucun message en cours.",
  scheduled: "Aucun message programmé.",
  past: "Aucun message passé.",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Public en une ligne : « Toute l'église », « Ministres · 2 départements (responsables) ». */
export function summarizeAudience(audience: Audience, instance: boolean): string {
  const parts: string[] = [];
  if (audience.roles.length > 0) parts.push(audience.roles.map((r) => ROLE_LABELS[r]).join(", "));
  const org: string[] = [];
  if (audience.ministryIds.length > 0) org.push(`${audience.ministryIds.length} ministère${audience.ministryIds.length > 1 ? "s" : ""}`);
  if (audience.departmentIds.length > 0) {
    org.push(`${audience.departmentIds.length} département${audience.departmentIds.length > 1 ? "s" : ""}`);
  }
  if (org.length > 0) parts.push(`${org.join(" et ")}${audience.headsOnly ? " (responsables)" : ""}`);
  if (parts.length === 0) return instance ? "Toute l'instance" : "Toute l'église";
  return `${instance ? "Instance · " : ""}${parts.join(" · ")}`;
}

function renderTitle(m: MessageListItem) {
  return (
    <span className="flex flex-col">
      {m.readOnly ? (
        <span className="font-semibold text-ink">{m.title}</span>
      ) : (
        <Link href={`/admin/messages/${m.id}`} className="font-semibold text-ink hover:underline">
          {m.title}
        </Link>
      )}
      {m.churchId === null && <span className="text-[13px] text-ink-muted">Koinonia · toute l&apos;instance</span>}
    </span>
  );
}

function renderSeverity(m: MessageListItem) {
  return <StatusChip tone={SEVERITY_TONE[m.severity]}>{SEVERITY_LABEL[m.severity]}</StatusChip>;
}

function WithdrawButton({
  message,
  onWithdraw,
}: {
  readonly message: MessageListItem;
  readonly onWithdraw: (message: MessageListItem) => void;
}) {
  return (
    <Button size="sm" variant="ghost" onClick={() => onWithdraw(message)}>
      Retirer
    </Button>
  );
}

/** Liste des messages d'un état (spec 071), avec statistiques et retrait. */
export default function MessagesClient({
  messages,
  status,
}: {
  readonly messages: MessageListItem[];
  readonly status: MessageStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [withdrawing, setWithdrawing] = useState<MessageListItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/system-messages/${withdrawing.id}/withdraw`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Retrait impossible.");
        return;
      }
      toast.success("Message retiré");
      router.refresh();
    } finally {
      setBusy(false);
      setWithdrawing(null);
    }
  }

  if (messages.length === 0) return <EmptyState title={EMPTY[status]} />;

  return (
    <>
      <DataTable
        data={messages}
        columns={[
          {
            header: "Message",
            primary: true,
            accessor: renderTitle,
          },
          {
            header: "Sévérité",
            accessor: renderSeverity,
          },
          { header: "Public", accessor: (m) => summarizeAudience(m.audience, m.churchId === null), hideOnMobile: true },
          { header: "Période", accessor: (m) => `${formatDate(m.startsAt)} → ${formatDate(m.endsAt)}` },
          {
            header: "Visées · vues · fermées",
            align: "right",
            accessor: (m) => `${m.stats.recipients ?? "—"} · ${m.stats.seen} · ${m.stats.dismissed}`,
          },
        ]}
        actions={(m) => (status === "past" || m.readOnly ? null : <WithdrawButton message={m} onWithdraw={setWithdrawing} />)}
      />
      <ConfirmModal
        open={withdrawing !== null}
        title="Retirer ce message maintenant ?"
        message={
          withdrawing?.status === "scheduled"
            ? "Il ne s'affichera jamais et aucune notification ne partira."
            : "Le bandeau disparaît tout de suite pour tout le monde."
        }
        confirmLabel="Retirer le message"
        confirming={busy}
        onConfirm={withdraw}
        onCancel={() => setWithdrawing(null)}
      />
    </>
  );
}
