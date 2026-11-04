"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Checkbox, Input, Modal, SearchInput, Select, StatusChip } from "@/components/ui";
import type { BookingRow, PaymentRow } from "@/modules/ticketing";
import { CHARGE_STATUS_LABEL, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, formatEuros } from "@/modules/ticketing/schemas";
import { useApi } from "../../use-api";

type ChargeAction = { booking: BookingRow; mode: "receipt" | "refund" };
const KIND_LABEL = { DECLARATION: "Déclaration", RECEIPT: "Encaissement", REFUND: "Remboursement" } as const;
const STATUS_LABEL = { PENDING: "À confirmer", CONFIRMED: "Confirmé", REJECTED: "Refusé" } as const;
const STATUS_TONE = { PENDING: "warning", CONFIRMED: "success", REJECTED: "neutral" } as const;

function ChargesModal({ eventId, action, onClose }: { readonly eventId: string; readonly action: ChargeAction; readonly onClose: () => void }) {
  const { call, busy } = useApi();
  const wanted = action.mode === "receipt" ? ["DUE", "DECLARED"] : ["REFUND_DUE"];
  const charges = action.booking.charges.filter((c) => wanted.includes(c.status));
  const [picked, setPicked] = useState<Set<string>>(new Set(charges.map((c) => `${c.type}:${c.id}`)));
  const [method, setMethod] = useState<string>(action.mode === "receipt" ? "CASH" : "TRANSFER");
  const total = charges.filter((c) => picked.has(`${c.type}:${c.id}`)).reduce((n, c) => n + c.amount, 0);
  async function submit() {
    const ok = await call(
      `/api/ticketing/events/${eventId}/bookings/${action.booking.id}/${action.mode === "receipt" ? "receipts" : "refunds"}`,
      "POST",
      { method, charges: charges.filter((c) => picked.has(`${c.type}:${c.id}`)).map((c) => ({ type: c.type, id: c.id })) },
      action.mode === "receipt" ? "Encaissement enregistré" : "Remboursement enregistré"
    );
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title={`${action.mode === "receipt" ? "Encaisser" : "Rembourser"} — ${action.booking.reference}`}>
      <div className="space-y-3">
        {charges.map((c) => {
          const key = `${c.type}:${c.id}`;
          return (
            <label key={key} className="flex min-h-11 items-center gap-3">
              <Checkbox
                checked={picked.has(key)}
                onChange={(e) =>
                  setPicked((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
              />
              <span className="flex-1 text-[15px] text-ink">{c.label}</span>
              <span className="text-[15px] text-ink">{formatEuros(c.amount)}</span>
            </label>
          );
        })}
        <Select label="Moyen" value={method} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} onChange={(e) => setMethod(e.target.value)} />
        <Button type="button" disabled={busy || total <= 0} onClick={submit}>
          {action.mode === "receipt" ? "Encaisser" : "Marquer remboursé"} {formatEuros(total)}
        </Button>
      </div>
    </Modal>
  );
}

/** Règlements : déclarations à confirmer, encaissements directs, remboursements, historique, exports. */
export default function PaymentsTab({
  eventId,
  bookings,
  payments,
}: {
  readonly eventId: string;
  readonly bookings: BookingRow[];
  readonly payments: PaymentRow[];
}) {
  const { call, busy } = useApi();
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null);
  const [action, setAction] = useState<ChargeAction | null>(null);
  const [search, setSearch] = useState("");
  const pending = payments.filter((p) => p.kind === "DECLARATION" && p.status === "PENDING");
  const toRefund = bookings.filter((b) => b.balances.refundDue > 0);
  const q = search.trim().toLowerCase();
  const payable = bookings.filter(
    (b) =>
      b.status === "ACTIVE" &&
      b.balances.due + b.balances.declared > 0 &&
      (!q || [b.reference, b.contact.name, ...b.participants.map((p) => `${p.firstName} ${p.lastName}`)].some((s) => s.toLowerCase().includes(q)))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {(["payments", "refunds", "options"] as const).map((type) => (
          <a key={type} className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-text underline" href={`/api/ticketing/events/${eventId}/export?type=${type}`}>
            <Download className="size-4" aria-hidden="true" /> {{ payments: "Règlements", refunds: "Remboursements", options: "Options" }[type]}
          </a>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Déclarés à confirmer ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Aucune déclaration en attente.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] text-ink">
                  <strong>{p.reference}</strong> {p.contactName} — {PAYMENT_METHOD_LABEL[p.method]} {formatEuros(p.amount)}
                </span>
                <span className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => call(`/api/ticketing/events/${eventId}/payments/${p.id}`, "PATCH", { action: "confirm" }, "Paiement confirmé")}>
                    Reçu
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setReject({ id: p.id, reason: "" })}>
                    Refuser
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Encaisser en direct</h2>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, référence…" aria-label="Rechercher une réservation à encaisser" />
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {payable.slice(0, 50).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] text-ink">
                <strong>{b.reference}</strong> {b.contact.name} — reste {formatEuros(b.balances.due + b.balances.declared)}
              </span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAction({ booking: b, mode: "receipt" })}>
                Encaisser
              </Button>
            </li>
          ))}
          {payable.length === 0 && <li className="px-4 py-3 text-[15px] text-ink-muted">Rien à encaisser.</li>}
        </ul>
      </section>

      {toRefund.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-ink">À rembourser ({toRefund.length})</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {toRefund.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] text-ink">
                  <strong>{b.reference}</strong> {b.contact.name} — {formatEuros(b.balances.refundDue)}
                  <span className="block text-[13px] text-ink-muted">
                    {b.charges.filter((c) => c.status === "REFUND_DUE").map((c) => c.label).join(" · ")}
                  </span>
                </span>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAction({ booking: b, mode: "refund" })}>
                  Rembourser
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Historique</h2>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[13px]">
              <span className="text-ink">
                {new Date(p.createdAt).toLocaleString("fr-FR")} · {p.reference} · {KIND_LABEL[p.kind]} {PAYMENT_METHOD_LABEL[p.method]} {formatEuros(p.amount)}
                {p.reason ? ` — ${p.reason}` : ""}
              </span>
              <StatusChip tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</StatusChip>
            </li>
          ))}
          {payments.length === 0 && <li className="px-4 py-3 text-[15px] text-ink-muted">Aucun paiement.</li>}
        </ul>
        <p className="text-[13px] text-ink-subtle">États par élément : {Object.values(CHARGE_STATUS_LABEL).join(", ")}.</p>
      </section>

      {action && <ChargesModal eventId={eventId} action={action} onClose={() => setAction(null)} />}
      {reject && (
        <Modal open onClose={() => setReject(null)} title="Refuser la déclaration" mobileLayout="sheet">
          <div className="space-y-3">
            <Input label="Motif (envoyé au participant)" value={reject.reason} onChange={(e) => setReject({ ...reject, reason: e.target.value })} />
            <Button
              type="button"
              variant="danger"
              disabled={busy || !reject.reason.trim()}
              onClick={async () => {
                const ok = await call(`/api/ticketing/events/${eventId}/payments/${reject.id}`, "PATCH", { action: "reject", reason: reject.reason.trim() }, "Déclaration refusée");
                if (ok) setReject(null);
              }}
            >
              Refuser
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
