"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import StatusChip from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";

function eventCountLabel(count: number): string {
  if (count === 0) return "Aucun événement à venir";
  const plural = count > 1 ? "s" : "";
  return `${count} événement${plural} à venir`;
}

interface MonthRow {
  month: string;
  eventCount: number;
  open: boolean;
  closesAt: string | null;
}

function monthLabel(key: string): string {
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export default function CollectionsPanel({
  churchId,
  months,
}: {
  readonly churchId: string;
  readonly months: MonthRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function open() {
    if (!target) return;
    setOpening(true);
    try {
      const res = await fetch("/api/availability/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId, month: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Ouverture impossible");
      toast.success(`Collecte de ${monthLabel(target)} ouverte : ${json.notified} STAR notifié${json.notified > 1 ? "s" : ""}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ouverture impossible");
    } finally {
      setOpening(false);
      setTarget(null);
    }
  }

  return (
    <>
      <ul className="bg-surface rounded-xl border border-line divide-y divide-line">
        {months.map((m) => (
          <li key={m.month} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{monthLabel(m.month)}</p>
              <p className="text-sm text-ink-muted">
                {eventCountLabel(m.eventCount)}
              </p>
            </div>
            {m.open ? (
              <StatusChip tone="success">
                Ouverte{m.closesAt ? ` · jusqu'au ${dateFmt.format(new Date(m.closesAt))}` : ""}
              </StatusChip>
            ) : (
              <Button variant="secondary" size="sm" disabled={m.eventCount === 0} onClick={() => setTarget(m.month)}>
                Ouvrir maintenant
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        open={target !== null}
        title={target ? `Ouvrir la collecte de ${monthLabel(target)} ?` : ""}
        message="Tous les STAR des départements concernés reçoivent une notification pour indiquer leurs disponibilités."
        confirmLabel="Ouvrir la collecte"
        variant="primary"
        confirming={opening}
        onConfirm={open}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
