"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input, Select, Textarea, useToast } from "@/components/ui";
import type { EventDetail } from "@/modules/ticketing";
import { AGE_GROUPS, AGE_GROUP_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL } from "@/modules/ticketing/schemas";
import type { TicketingAgeGroup } from "@/generated/prisma/enums";
import { useApi } from "../../use-api";
import OptionsSection from "./OptionsSection";

/** `Date` ou ISO → valeur d'un champ `datetime-local` (heure locale). */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function Toggle({ label, checked, onChange, hint }: { readonly label: string; readonly checked: boolean; readonly onChange: (v: boolean) => void; readonly hint?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Paramètres de l'événement (organisateur) : infos, jauge, tarifs, paiements, règles, questions, options. */
export default function SettingsTab({ event }: { readonly event: EventDetail }) {
  const { call, busy } = useApi();
  const toast = useToast();
  const router = useRouter();
  const pm = event.paymentMethods;
  const [f, setF] = useState({
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    registrationDeadline: toLocalInput(event.registrationDeadline),
    status: event.status,
    capacity: String(event.capacity),
    seatsOpen: String(event.seatsOpen),
    optionPaymentDeadline: toLocalInput(event.optionPaymentDeadline),
    reminderDaysBefore: String(event.reminderDaysBefore),
    allowOnsitePayment: event.allowOnsitePayment,
    allowUnaccompaniedMinors: event.allowUnaccompaniedMinors,
    allowWalkIns: event.allowWalkIns,
    entryRefundable: event.entryRefundable,
    entryRefundDeadline: toLocalInput(event.entryRefundDeadline),
    referencePrefix: event.referencePrefix,
    retentionDays: String(event.retentionDays),
    wero: pm.wero?.target ?? "",
    revolut: pm.revolut?.link ?? "",
    iban: pm.transfer?.iban ?? "",
    holder: pm.transfer?.holder ?? "",
    cash: pm.cash,
    cheque: pm.cheque,
  });
  const [tariffs, setTariffs] = useState<Partial<Record<TicketingAgeGroup, string>>>(
    Object.fromEntries(event.tariffs.map((t) => [t.ageGroup, String(t.price)]))
  );
  const [questions, setQuestions] = useState(event.questions);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((x) => ({ ...x, [key]: value }));

  async function save() {
    await call(
      `/api/ticketing/events/${event.id}`,
      "PATCH",
      {
        title: f.title,
        description: f.description || null,
        location: f.location || null,
        startsAt: fromLocalInput(f.startsAt),
        endsAt: fromLocalInput(f.endsAt),
        registrationDeadline: fromLocalInput(f.registrationDeadline),
        status: f.status,
        capacity: Number(f.capacity),
        seatsOpen: Number(f.seatsOpen),
        tariffs: Object.entries(tariffs)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([ageGroup, price]) => ({ ageGroup, price: Number(String(price).replace(",", ".")) })),
        paymentMethods: {
          wero: f.wero ? { target: f.wero } : null,
          revolut: f.revolut ? { link: f.revolut } : null,
          transfer: f.iban ? { iban: f.iban, holder: f.holder } : null,
          cash: f.cash,
          cheque: f.cheque,
        },
        optionPaymentDeadline: fromLocalInput(f.optionPaymentDeadline),
        reminderDaysBefore: Number(f.reminderDaysBefore),
        allowOnsitePayment: f.allowOnsitePayment,
        allowUnaccompaniedMinors: f.allowUnaccompaniedMinors,
        allowWalkIns: f.allowWalkIns,
        entryRefundable: f.entryRefundable,
        entryRefundDeadline: fromLocalInput(f.entryRefundDeadline),
        questions: questions.filter((q) => q.label.trim()),
        referencePrefix: f.referencePrefix,
        retentionDays: Number(f.retentionDays),
      },
      "Paramètres enregistrés"
    );
  }

  async function uploadPoster(file: File | undefined) {
    if (!file) return;
    const res = await fetch(`/api/ticketing/events/${event.id}/poster`, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "L'affiche n'a pas été enregistrée.");
      return;
    }
    toast.success("Affiche enregistrée");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Section title="Informations">
        <Input label="Titre" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <Textarea label="Description" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} />
        <Input label="Lieu" value={f.location} onChange={(e) => set("location", e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Début" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          <Input label="Fin" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </div>
        <Input label="Date limite d'inscription (facultative)" type="datetime-local" value={f.registrationDeadline} onChange={(e) => set("registrationDeadline", e.target.value)} />
        <Select
          label="État"
          value={f.status}
          options={EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] }))}
          onChange={(e) => set("status", e.target.value as typeof f.status)}
          hint="Seul un événement « Inscriptions ouvertes » accepte des inscriptions. « Clôturé » arrête les rôles de l'équipe."
        />
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-ink">Affiche</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadPoster(e.target.files?.[0])} className="text-[13px]" />
          {event.posterKey && (
            <Button type="button" size="sm" variant="ghost" onClick={() => call(`/api/ticketing/events/${event.id}/poster`, "DELETE", undefined, "Affiche retirée")}>
              Retirer l&apos;affiche
            </Button>
          )}
        </div>
      </Section>

      <Section title="Jauge et places">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Jauge réglementaire" hint="Personnes dans le bâtiment, équipe comprise." type="number" min={1} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} />
          <Input label="Places ouvertes à l'inscription" hint="Inférieures à la jauge : marge pour l'équipe." type="number" min={0} value={f.seatsOpen} onChange={(e) => set("seatsOpen", e.target.value)} />
        </div>
      </Section>

      <Section title="Tarifs par participant">
        {AGE_GROUPS.map((g) => (
          <div key={g} className="flex items-center gap-3">
            <label className="flex min-h-11 w-44 items-center gap-3">
              <Checkbox
                checked={tariffs[g] !== undefined}
                onChange={(e) => setTariffs((t) => ({ ...t, [g]: e.target.checked ? "0" : undefined }))}
              />
              <span className="text-[15px] text-ink">{AGE_GROUP_LABEL[g]}</span>
            </label>
            {tariffs[g] !== undefined && (
              <Input aria-label={`Prix ${AGE_GROUP_LABEL[g]}`} inputMode="decimal" value={tariffs[g]} onChange={(e) => setTariffs((t) => ({ ...t, [g]: e.target.value }))} />
            )}
          </div>
        ))}
        <p className="text-[13px] text-ink-muted">0 = gratuit. Une tranche non cochée n&apos;est pas proposée.</p>
      </Section>

      <Section title="Moyens de paiement">
        <p className="text-[13px] text-ink-muted">Jamais les coordonnées bancaires de l&apos;église : seulement celles du bénéficiaire de l&apos;événement.</p>
        <Input label="Wero — téléphone ou email du bénéficiaire" value={f.wero} onChange={(e) => set("wero", e.target.value)} />
        <Input label="Revolut — lien de paiement (https)" value={f.revolut} onChange={(e) => set("revolut", e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Virement — IBAN propre à l'événement" value={f.iban} onChange={(e) => set("iban", e.target.value)} />
          <Input label="Titulaire du compte" value={f.holder} onChange={(e) => set("holder", e.target.value)} />
        </div>
        <Toggle label="Espèces sur place" checked={f.cash} onChange={(v) => set("cash", v)} />
        <Toggle label="Chèque sur place" checked={f.cheque} onChange={(v) => set("cheque", v)} />
      </Section>

      <Section title="Paiement et annulation">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Date limite de paiement des options" type="datetime-local" value={f.optionPaymentDeadline} onChange={(e) => set("optionPaymentDeadline", e.target.value)} />
          <Input label="Relance (jours avant)" type="number" min={0} max={30} value={f.reminderDaysBefore} onChange={(e) => set("reminderDaysBefore", e.target.value)} />
        </div>
        <Toggle
          label="Paiement sur place autorisé"
          hint="Les options non réglées ne sont pas libérées à la date limite : elles s'affichent « à régler » au retrait."
          checked={f.allowOnsitePayment}
          onChange={(v) => set("allowOnsitePayment", v)}
        />
        <Toggle label="Entrée remboursable en cas d'annulation" checked={f.entryRefundable} onChange={(v) => set("entryRefundable", v)} />
        {f.entryRefundable && (
          <Input label="Date limite de remboursement de l'entrée (facultative)" type="datetime-local" value={f.entryRefundDeadline} onChange={(e) => set("entryRefundDeadline", e.target.value)} />
        )}
      </Section>

      <Section title="Règles">
        <Toggle
          label="Mineurs non accompagnés autorisés"
          hint="Un responsable légal (nom, téléphone, autorisation) est alors exigé."
          checked={f.allowUnaccompaniedMinors}
          onChange={(v) => set("allowUnaccompaniedMinors", v)}
        />
        <Toggle label="Ajout sur place à l'entrée" checked={f.allowWalkIns} onChange={(v) => set("allowWalkIns", v)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Préfixe des références" hint="Ex. NT26 → NT26-0042" value={f.referencePrefix} onChange={(e) => set("referencePrefix", e.target.value.toUpperCase())} />
          <Input label="Conservation des données (jours après la clôture)" type="number" min={7} max={730} value={f.retentionDays} onChange={(e) => set("retentionDays", e.target.value)} />
        </div>
      </Section>

      <Section title="Questions supplémentaires">
        {questions.map((q, i) => (
          <div key={q.id} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Input label={`Question ${i + 1}`} value={q.label} onChange={(e) => setQuestions((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </div>
            <Toggle label="Obligatoire" checked={q.required} onChange={(v) => setQuestions((l) => l.map((x, j) => (j === i ? { ...x, required: v } : x)))} />
            <Button type="button" variant="ghost" size="sm" aria-label="Retirer la question" onClick={() => setQuestions((l) => l.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        {questions.length < 10 && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setQuestions((l) => [...l, { id: `q${Date.now().toString(36)}`, label: "", required: false }])}>
            <Plus className="size-4" aria-hidden="true" /> Ajouter une question
          </Button>
        )}
      </Section>

      <div data-k-bottom-bar className="sticky bottom-20 z-10 md:bottom-4">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer les paramètres"}
        </Button>
      </div>

      <OptionsSection event={event} />
    </div>
  );
}
