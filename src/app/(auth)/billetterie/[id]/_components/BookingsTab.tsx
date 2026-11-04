"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, ConfirmModal, FilterChip, SearchInput, StatusChip } from "@/components/ui";
import type { BookingRow } from "@/modules/ticketing";
import { AGE_GROUP_LABEL, CHARGE_STATUS_LABEL, formatEuros, type TicketingQuestion } from "@/modules/ticketing/schemas";
import { useApi } from "../../use-api";

type Filter = "all" | "due" | "cancelled";

/** Inscrits : réservations, participants, soldes ; annulation et relance par l'organisation. */
export default function BookingsTab({
  eventId,
  bookings,
  canManage,
  questions,
}: {
  readonly eventId: string;
  readonly bookings: BookingRow[];
  readonly canManage: boolean;
  readonly questions: TicketingQuestion[];
}) {
  const { call, busy } = useApi();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [cancel, setCancel] = useState<{ bookingId: string; participantId: string | null; label: string } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter === "due" && b.balances.due + b.balances.declared <= 0) return false;
      if (filter === "cancelled" && b.status !== "CANCELLED") return false;
      if (filter !== "cancelled" && b.status === "CANCELLED") return false;
      if (!q) return true;
      return [b.reference, b.contact.name, ...b.participants.map((p) => `${p.firstName} ${p.lastName}`)].some((s) => s.toLowerCase().includes(q));
    });
  }, [bookings, search, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, référence…" aria-label="Rechercher" />
        </div>
        <FilterChip pressed={filter === "all"} onClick={() => setFilter("all")}>Actives</FilterChip>
        <FilterChip pressed={filter === "due"} onClick={() => setFilter("due")}>Reste à régler</FilterChip>
        <FilterChip pressed={filter === "cancelled"} onClick={() => setFilter("cancelled")}>Annulées</FilterChip>
        {canManage && (
          <a className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-text underline" href={`/api/ticketing/events/${eventId}/export?type=participants`}>
            <Download className="size-4" aria-hidden="true" /> Participants
          </a>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">{rows.length} réservation{rows.length > 1 ? "s" : ""}</p>
      <ul className="space-y-3">
        {rows.map((b) => (
          <li key={b.id} className="space-y-2 rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">
                  {b.reference} — {b.contact.name}
                  {b.source === "ONSITE" && <span className="ml-2 text-[13px] text-ink-muted">(sur place)</span>}
                </p>
                {b.contact.email && (
                  <p className="text-[13px] text-ink-muted">
                    {b.contact.email}
                    {b.contact.phone ? ` · ${b.contact.phone}` : ""}
                  </p>
                )}
                {b.guardian && (
                  <p className="text-[13px] text-warning">
                    Mineur non accompagné — responsable : {b.guardian.name} {b.guardian.phone}
                  </p>
                )}
              </div>
              <div className="text-right text-[13px]">
                <p className="text-ink">Total {formatEuros(b.balances.total)}</p>
                {b.balances.due > 0 && <p className="text-warning">Reste {formatEuros(b.balances.due)}</p>}
                {b.balances.declared > 0 && <p className="text-info">Déclaré {formatEuros(b.balances.declared)}</p>}
                {b.balances.refundDue > 0 && <p className="text-info">À rembourser {formatEuros(b.balances.refundDue)}</p>}
              </div>
            </div>
            <ul className="space-y-1">
              {b.participants.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                  <span className={p.status === "ACTIVE" ? "text-ink" : "text-ink-subtle line-through"}>
                    {p.firstName} {p.lastName} · {AGE_GROUP_LABEL[p.ageGroup]}
                    {p.entryPrice > 0 && ` · entrée ${CHARGE_STATUS_LABEL[p.entryStatus].toLowerCase()}`}
                  </span>
                  {canManage && p.status === "ACTIVE" && b.participants.filter((x) => x.status === "ACTIVE").length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCancel({ bookingId: b.id, participantId: p.id, label: `${p.firstName} ${p.lastName}` })}>
                      Annuler
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {b.charges.some((c) => c.type === "item") && (
              <p className="text-[13px] text-ink-muted">
                {b.charges.filter((c) => c.type === "item").map((c) => `${c.label} (${CHARGE_STATUS_LABEL[c.status].toLowerCase()})`).join(" · ")}
              </p>
            )}
            {questions.length > 0 && Object.keys(b.answers).length > 0 && (
              <p className="text-[13px] text-ink-muted">
                {questions.filter((q) => b.answers[q.id]).map((q) => `${q.label} : ${b.answers[q.id]}`).join(" · ")}
              </p>
            )}
            {canManage && b.status === "ACTIVE" && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => call(`/api/ticketing/events/${eventId}/bookings/${b.id}`, "PATCH", { action: "remind" }, "Récapitulatif renvoyé")}>
                  Renvoyer le récapitulatif
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCancel({ bookingId: b.id, participantId: null, label: b.reference })}>
                  Annuler la réservation
                </Button>
              </div>
            )}
            {b.status === "CANCELLED" && <StatusChip>Annulée</StatusChip>}
          </li>
        ))}
      </ul>
      {cancel && (
        <ConfirmModal
          open
          variant="danger"
          title={`Annuler ${cancel.label} ?`}
          message="Les places et le stock sont rendus. Chaque élément payé suit ses règles de remboursement ; le contact est prévenu par email."
          confirmLabel="Annuler"
          confirmingLabel="Annulation…"
          confirming={busy}
          onCancel={() => setCancel(null)}
          onConfirm={async () => {
            const ok = await call(
              `/api/ticketing/events/${eventId}/bookings/${cancel.bookingId}`,
              "PATCH",
              cancel.participantId ? { action: "cancelParticipant", participantId: cancel.participantId } : { action: "cancelBooking" },
              "Annulation enregistrée"
            );
            if (ok) setCancel(null);
          }}
        />
      )}
    </div>
  );
}
