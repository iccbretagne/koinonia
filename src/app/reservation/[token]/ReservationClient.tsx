"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, QrCode, Share2, UserPlus, X } from "lucide-react";
import CopyRow from "@/app/donner/_components/CopyRow";
import OptionField, { toSelections, type Choices } from "@/components/ticketing/OptionField";
import QrSvg from "@/components/ticketing/QrSvg";
import { formatDateTime } from "@/components/ticketing/format";
import { Alert, Button, ConfirmModal, Input, Modal, Select, StatusChip, useToast, type StatusTone } from "@/components/ui";
import type { BookingView } from "@/modules/ticketing";
import {
  AGE_GROUP_LABEL,
  CHARGE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatEuros,
  type PublicEvent,
} from "@/modules/ticketing/schemas";
import type { TicketingAgeGroup, TicketingChargeStatus } from "@/generated/prisma/enums";

type Qr = { size: number; path: string };

export const CHARGE_TONE: Record<TicketingChargeStatus, StatusTone> = {
  FREE: "neutral",
  DUE: "warning",
  DECLARED: "info",
  PAID: "success",
  REFUND_DUE: "info",
  REFUNDED: "neutral",
  RELEASED: "neutral",
  CANCELLED: "neutral",
};

function ChargeChip({ status }: { readonly status: TicketingChargeStatus }) {
  return <StatusChip tone={CHARGE_TONE[status]}>{CHARGE_STATUS_LABEL[status]}</StatusChip>;
}

type Dialog =
  | { kind: "qr"; title: string; qr: Qr }
  | { kind: "rename"; participantId: string; firstName: string; lastName: string }
  | { kind: "cancelParticipant"; participantId: string; name: string; noRefund: boolean }
  | { kind: "cancelBooking"; noRefund: boolean }
  | { kind: "phone"; phone: string }
  | { kind: "options" }
  | { kind: "add" }
  | null;

/** Liste des éléments payés non remboursables qu'une annulation laisserait sans remboursement. */
function hasNonRefundablePaid(view: BookingView, participantId: string | null): boolean {
  const entries = view.participants.filter((p) => (participantId ? p.id === participantId : true));
  const items = view.items.filter((i) => i.active && (participantId ? i.participantId === participantId : true));
  return entries.some((p) => p.entryStatus === "PAID" && !p.refundableNow) || items.some((i) => i.status === "PAID" && !i.refundableNow);
}

function OptionsEditor({
  view,
  event,
  onSave,
}: {
  readonly view: BookingView;
  readonly event: PublicEvent;
  readonly onSave: (body: unknown) => Promise<boolean>;
}) {
  const active = view.items.filter((i) => i.active);
  const initial = (participantId: string | null): Choices =>
    Object.fromEntries(active.filter((i) => i.participantId === participantId).map((i) => [i.optionId, { variantId: i.variantId ?? undefined, quantity: i.quantity }]));
  const people = view.participants.filter((p) => p.status === "ACTIVE");
  const [byPerson, setByPerson] = useState<Record<string, Choices>>(Object.fromEntries(people.map((p) => [p.id, initial(p.id)])));
  const [booking, setBooking] = useState<Choices>(initial(null));
  const [saving, setSaving] = useState(false);
  const pOptions = event.options.filter((o) => o.scope === "PARTICIPANT");
  const bOptions = event.options.filter((o) => o.scope === "BOOKING");
  return (
    <div className="space-y-4">
      {people.map((p) => (
        <fieldset key={p.id} className="space-y-3">
          <legend className="font-semibold text-ink">
            {p.firstName} {p.lastName}
          </legend>
          {pOptions.map((o) => (
            <OptionField
              key={o.id}
              option={o}
              choice={byPerson[p.id]?.[o.id]}
              onChange={(c) => setByPerson((all) => ({ ...all, [p.id]: { ...all[p.id], [o.id]: c } }))}
            />
          ))}
        </fieldset>
      ))}
      {bOptions.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink">Pour la réservation</legend>
          {bOptions.map((o) => (
            <OptionField key={o.id} option={o} choice={booking[o.id]} onChange={(c) => setBooking((b) => ({ ...b, [o.id]: c }))} />
          ))}
        </fieldset>
      )}
      <p className="text-[13px] text-ink-muted">Une option déjà payée que vous retirez suit les règles de remboursement de l&apos;événement.</p>
      <Button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSave({
            action: "updateOptions",
            participants: people.map((p) => ({ participantId: p.id, options: toSelections(pOptions, byPerson[p.id] ?? {}) })),
            bookingOptions: toSelections(bOptions, booking),
          });
          setSaving(false);
        }}
      >
        {saving ? "Enregistrement…" : "Enregistrer mes options"}
      </Button>
    </div>
  );
}

function AddParticipant({ event, onSave }: { readonly event: PublicEvent; readonly onSave: (body: unknown) => Promise<boolean> }) {
  const [p, setP] = useState({ firstName: "", lastName: "", ageGroup: (event.tariffs[0]?.ageGroup ?? "ADULT") as TicketingAgeGroup });
  const [choices, setChoices] = useState<Choices>({});
  const [saving, setSaving] = useState(false);
  const pOptions = event.options.filter((o) => o.scope === "PARTICIPANT");
  return (
    <div className="space-y-3">
      <Input label="Prénom" value={p.firstName} onChange={(e) => setP({ ...p, firstName: e.target.value })} />
      <Input label="Nom" value={p.lastName} onChange={(e) => setP({ ...p, lastName: e.target.value })} />
      <Select
        label="Tranche d'âge"
        value={p.ageGroup}
        options={event.tariffs.map((t) => ({ value: t.ageGroup, label: `${AGE_GROUP_LABEL[t.ageGroup]} — ${t.price > 0 ? formatEuros(t.price) : "gratuit"}` }))}
        onChange={(e) => setP({ ...p, ageGroup: e.target.value as TicketingAgeGroup })}
      />
      {pOptions.map((o) => (
        <OptionField key={o.id} option={o} choice={choices[o.id]} onChange={(c) => setChoices((x) => ({ ...x, [o.id]: c }))} />
      ))}
      <Button
        type="button"
        disabled={saving || !p.firstName.trim() || !p.lastName.trim()}
        onClick={async () => {
          setSaving(true);
          await onSave({ action: "addParticipant", participant: { ...p, options: toSelections(pOptions, choices) } });
          setSaving(false);
        }}
      >
        {saving ? "Ajout…" : "Ajouter"}
      </Button>
    </div>
  );
}

async function shareTicket(name: string, url: string) {
  const text = `Billet de ${name}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: text, url });
      return;
    } catch {
      // partage annulé : repli WhatsApp
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} : ${url}`)}`, "_blank", "noopener");
}

/** « Ma réservation » (spec 074) : récapitulatif, paiement, billets, modifications, annulation. */
export default function ReservationClient({
  token,
  view,
  publicEvent,
  qrs,
  justCreated,
}: {
  readonly token: string;
  readonly view: BookingView;
  readonly publicEvent: PublicEvent | null;
  readonly qrs: { booking: Qr; tickets: Record<string, Qr> };
  readonly justCreated: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<string>(view.remoteMethods[0] ?? "");
  const active = view.status === "ACTIVE";
  const { balances, instructions } = view;

  async function call(url: string, method: "PATCH" | "POST", body: unknown): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(data.error ?? "L'opération n'a pas abouti.");
      return false;
    }
    toast.success(data.message ?? "C'est enregistré.");
    setDialog(null);
    router.refresh();
    return true;
  }
  const patch = (body: unknown) => call(`/api/ticketing/public/bookings/${token}`, "PATCH", body);

  return (
    <div className="space-y-6">
      {justCreated && (
        <Alert tone="success" title="Réservation enregistrée.">
          Vos billets et le lien de cette page vous ont été envoyés par email. Gardez ce lien : il permet de modifier ou d&apos;annuler
          la réservation.
        </Alert>
      )}
      {!active && <Alert tone="info" title="Réservation annulée.">Les billets de cette réservation ne sont plus valables.</Alert>}

      <section className="rounded-card border border-line bg-surface p-4">
        <CopyRow label="Référence à indiquer avec votre paiement" display={view.reference} value={view.reference} mono />
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[15px]">
          <dt className="text-ink-muted">Total</dt>
          <dd className="text-right font-semibold text-ink">{balances.total > 0 ? formatEuros(balances.total) : "Gratuit"}</dd>
          <dt className="text-ink-muted">Payé</dt>
          <dd className="text-right text-ink">{formatEuros(balances.paid)}</dd>
          {balances.declared > 0 && (
            <>
              <dt className="text-ink-muted">Déclaré, en attente</dt>
              <dd className="text-right text-ink">{formatEuros(balances.declared)}</dd>
            </>
          )}
          <dt className="font-semibold text-ink">Reste à régler</dt>
          <dd className="text-right font-bold text-ink">{formatEuros(balances.due)}</dd>
          {balances.refundDue > 0 && (
            <>
              <dt className="text-ink-muted">À vous rembourser</dt>
              <dd className="text-right text-ink">{formatEuros(balances.refundDue)}</dd>
            </>
          )}
        </dl>
      </section>

      {active && balances.due > 0 && (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4" aria-label="Paiement">
          <h2 className="text-lg font-bold text-ink">Payer</h2>
          {instructions.wero && <CopyRow label="Wero — numéro ou email du bénéficiaire" display={instructions.wero} value={instructions.wero} />}
          {instructions.revolut && (
            <p className="text-[15px]">
              <a className="font-semibold text-brand-text underline" href={instructions.revolut} target="_blank" rel="noopener noreferrer">
                Payer avec Revolut
              </a>
            </p>
          )}
          {instructions.transfer && (
            <>
              <CopyRow label="IBAN de l'événement" display={instructions.transfer.iban.replace(/(.{4})/g, "$1 ").trim()} value={instructions.transfer.iban} mono />
              <p className="text-[13px] text-ink-muted">Bénéficiaire : {instructions.transfer.holder}</p>
            </>
          )}
          {(instructions.cash || instructions.cheque) && (
            <p className="text-[15px] text-ink">
              {[instructions.cash && "Espèces", instructions.cheque && "chèque"].filter(Boolean).join(" ou ")} : sur place, à l&apos;accueil
              {view.event.allowOnsitePayment ? " ou au retrait des repas" : ""}.
            </p>
          )}
          {view.can.declare && view.remoteMethods.length > 0 && (
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <div className="min-w-40 flex-1">
                <Select
                  label="Moyen utilisé"
                  value={method}
                  options={view.remoteMethods.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
                  onChange={(e) => setMethod(e.target.value)}
                />
              </div>
              <Button type="button" disabled={busy || !method} onClick={() => call(`/api/ticketing/public/bookings/${token}/payment`, "POST", { method })}>
                J&apos;ai payé
              </Button>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3" aria-label="Billets">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Billets</h2>
          {active && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ kind: "qr", title: "Code de la réservation", qr: qrs.booking })}>
              <QrCode className="size-4" aria-hidden="true" /> Code de groupe
            </Button>
          )}
        </div>
        {view.participants.map((p) => {
          const qr = qrs.tickets[p.id];
          const name = `${p.firstName} ${p.lastName}`;
          return (
            <div key={p.id} className="space-y-2 rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={`font-semibold ${p.status === "ACTIVE" ? "text-ink" : "text-ink-subtle line-through"}`}>{name}</p>
                  <p className="text-[13px] text-ink-muted">{AGE_GROUP_LABEL[p.ageGroup]}</p>
                </div>
                {p.entryPrice > 0 && (
                  <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                    Entrée {formatEuros(p.entryPrice)} <ChargeChip status={p.entryStatus} />
                  </span>
                )}
              </div>
              {p.status === "ACTIVE" && qr && p.ticketUrl && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDialog({ kind: "qr", title: `Billet de ${name}`, qr })}>
                    <QrCode className="size-4" aria-hidden="true" /> Afficher
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => shareTicket(name, p.ticketUrl!)}>
                    <Share2 className="size-4" aria-hidden="true" /> Transmettre
                  </Button>
                  {view.can.rename && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: "rename", participantId: p.id, firstName: p.firstName, lastName: p.lastName })}>
                      <Pencil className="size-4" aria-hidden="true" /> Corriger le nom
                    </Button>
                  )}
                  {view.can.cancel && view.participants.filter((x) => x.status === "ACTIVE").length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: "cancelParticipant", participantId: p.id, name, noRefund: hasNonRefundablePaid(view, p.id) })}
                    >
                      <X className="size-4" aria-hidden="true" /> Annuler
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {view.can.addParticipant && publicEvent && (
          <Button type="button" variant="secondary" onClick={() => setDialog({ kind: "add" })}>
            <UserPlus className="size-4" aria-hidden="true" /> Ajouter un participant
          </Button>
        )}
      </section>

      {view.items.length > 0 && (
        <section className="space-y-3" aria-label="Options">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Options</h2>
            {view.can.editOptions && publicEvent && publicEvent.options.length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ kind: "options" })}>
                Modifier
              </Button>
            )}
          </div>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {view.items.map((i) => (
              <li key={i.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i.active ? "" : "opacity-60"}`}>
                <span className="text-[15px] text-ink">{i.label}</span>
                <span className="flex shrink-0 items-center gap-2 text-[13px] text-ink-muted">
                  {i.amount > 0 && formatEuros(i.amount)} <ChargeChip status={i.status} />
                </span>
              </li>
            ))}
          </ul>
          {view.event.optionPaymentDeadline && (
            <p className="text-[13px] text-ink-muted">
              Options modifiables et à régler jusqu&apos;au {formatDateTime(view.event.optionPaymentDeadline)}
              {view.event.allowOnsitePayment ? "." : " ; passé ce délai, les options non réglées sont libérées."}
            </p>
          )}
        </section>
      )}

      {active && (
        <section className="flex flex-wrap gap-3 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={() => setDialog({ kind: "phone", phone: view.contact.phone ?? "" })}>
            Mettre à jour mon téléphone
          </Button>
          {view.can.cancel && (
            <Button type="button" variant="danger" onClick={() => setDialog({ kind: "cancelBooking", noRefund: hasNonRefundablePaid(view, null) })}>
              Annuler la réservation
            </Button>
          )}
        </section>
      )}

      {view.payments.length > 0 && (
        <section aria-label="Historique des paiements" className="space-y-2">
          <h2 className="text-lg font-bold text-ink">Paiements</h2>
          <ul className="space-y-1 text-[13px] text-ink-muted">
            {view.payments.map((p) => (
              <li key={p.id}>
                {formatDateTime(p.createdAt)} — {PAYMENT_METHOD_LABEL[p.method]} {formatEuros(p.amount)} —{" "}
                {p.kind === "REFUND" ? "remboursement" : { PENDING: "déclaré, en attente", CONFIRMED: "confirmé", REJECTED: `refusé (${p.reason ?? ""})` }[p.status]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog?.kind === "qr" && (
        <Modal open onClose={() => setDialog(null)} title={dialog.title} mobileLayout="sheet">
          <div className="flex justify-center py-2">
            <QrSvg qr={dialog.qr} label={dialog.title} className="size-72" />
          </div>
        </Modal>
      )}
      {dialog?.kind === "rename" && (
        <Modal open onClose={() => setDialog(null)} title="Corriger le nom">
          <div className="space-y-3">
            <Input label="Prénom" value={dialog.firstName} onChange={(e) => setDialog({ ...dialog, firstName: e.target.value })} />
            <Input label="Nom" value={dialog.lastName} onChange={(e) => setDialog({ ...dialog, lastName: e.target.value })} />
            <Button
              type="button"
              disabled={busy || !dialog.firstName.trim() || !dialog.lastName.trim()}
              onClick={() => patch({ action: "renameParticipant", participantId: dialog.participantId, firstName: dialog.firstName.trim(), lastName: dialog.lastName.trim() })}
            >
              Enregistrer
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "phone" && (
        <Modal open onClose={() => setDialog(null)} title="Mon téléphone" mobileLayout="sheet">
          <div className="space-y-3">
            <Input label="Téléphone" type="tel" value={dialog.phone} onChange={(e) => setDialog({ ...dialog, phone: e.target.value })} />
            <Button type="button" disabled={busy} onClick={() => patch({ action: "updatePhone", phone: dialog.phone.trim() || null })}>
              Enregistrer
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === "options" && publicEvent && (
        <Modal open onClose={() => setDialog(null)} title="Modifier mes options" size="lg">
          <OptionsEditor view={view} event={publicEvent} onSave={patch} />
        </Modal>
      )}
      {dialog?.kind === "add" && publicEvent && (
        <Modal open onClose={() => setDialog(null)} title="Ajouter un participant">
          <AddParticipant event={publicEvent} onSave={patch} />
        </Modal>
      )}
      {(dialog?.kind === "cancelParticipant" || dialog?.kind === "cancelBooking") && (
        <ConfirmModal
          open
          variant="danger"
          title={dialog.kind === "cancelBooking" ? "Annuler la réservation ?" : `Annuler la participation de ${dialog.name} ?`}
          message={
            dialog.noRefund
              ? "Attention : une partie de ce qui a été payé n'est pas remboursable (ou le délai de remboursement est passé). Vous ne serez pas remboursé de ces éléments."
              : "Les places et les options seront libérées. Ce qui a été payé et reste remboursable vous sera remboursé par l'organisation."
          }
          confirmLabel="Annuler"
          confirmingLabel="Annulation…"
          confirming={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => patch(dialog.kind === "cancelBooking" ? { action: "cancelBooking" } : { action: "cancelParticipant", participantId: dialog.participantId })}
        />
      )}
    </div>
  );
}
