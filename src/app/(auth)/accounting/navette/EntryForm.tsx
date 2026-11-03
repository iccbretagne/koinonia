"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Image as ImageIcon, Upload, X } from "lucide-react";
import { Button, Checkbox, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import type { LedgerLine } from "@/modules/shuttle";
import {
  AUTHOR_EDIT_WINDOW_HOURS,
  DEFAULT_VENDOR,
  ENTRY_KIND_LABEL,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  RECEIPT_MAX_BYTES,
  RECEIPT_REQUIRED,
} from "@/modules/shuttle/schemas";
import type { ShuttleEntryKind, ShuttleExpenseCategory, ShuttlePaymentMethod } from "@/generated/prisma/enums";
import { euro, frDate, isoToday } from "./format";

export interface RentalOption {
  id: string;
  vendor: string;
  vehicle: string | null;
  startDate: string;
  endDate: string | null;
}

/** Ligne à pré-remplir : correction d'une ligne existante, ou restitution d'une caution. */
export type EntryFormSeed =
  | { mode: "create"; kind?: ShuttleEntryKind; returnOf?: LedgerLine }
  | { mode: "edit"; line: LedgerLine };

const MEMBER_KINDS: ShuttleEntryKind[] = ["EXPENSE", "DEPOSIT_RETURN", "VENDOR_REFUND"];

function initialState(seed: EntryFormSeed) {
  if (seed.mode === "edit") {
    const l = seed.line;
    return {
      kind: l.kind as ShuttleEntryKind,
      amount: String(Math.abs(l.amount)).replace(".", ","),
      date: l.date,
      category: (l.category ?? "FUEL") as ShuttleExpenseCategory,
      label: l.label ?? "",
      vendor: l.vendor ?? "",
      paymentMethod: (l.paymentMethod ?? "TRANSFER") as ShuttlePaymentMethod,
      liters: l.liters === null ? "" : String(l.liters).replace(".", ","),
      kilometers: l.kilometers === null ? "" : String(l.kilometers),
      personalAdvance: l.personalAdvance,
      rentalId: l.rental?.id ?? "",
      returnOfId: l.returnOfId ?? "",
      negative: l.kind === "OPENING_BALANCE" && l.amount < 0,
    };
  }
  const returnOf = seed.returnOf;
  return {
    kind: returnOf ? ("DEPOSIT_RETURN" as const) : (seed.kind ?? "EXPENSE"),
    amount: returnOf ? String(Math.abs(returnOf.amount)).replace(".", ",") : "",
    date: isoToday(),
    category: "FUEL" as ShuttleExpenseCategory,
    label: "",
    vendor: returnOf?.vendor ?? DEFAULT_VENDOR,
    paymentMethod: "TRANSFER" as ShuttlePaymentMethod,
    liters: "",
    kilometers: "",
    personalAdvance: false,
    rentalId: returnOf?.rental?.id ?? "",
    returnOfId: returnOf?.id ?? "",
    negative: false,
  };
}

const toNumber = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));

type FormState = ReturnType<typeof initialState>;

/** Natures proposées : l'équipe déclare dépenses et entrées du loueur ; la compta, tout. */
function availableKinds(manager: boolean, hasOpeningBalance: boolean): ShuttleEntryKind[] {
  if (!manager) return MEMBER_KINDS;
  return ["EXPENSE", "FUNDING", ...(hasOpeningBalance ? [] : (["OPENING_BALANCE"] as const)), "DEPOSIT_RETURN", "VENDOR_REFUND"];
}

/** Corps envoyé à l'API, selon la nature de la ligne. */
function buildPayload(form: FormState) {
  const amount = toNumber(form.amount);
  const base = { kind: form.kind, date: form.date, label: form.label || null };
  switch (form.kind) {
    case "OPENING_BALANCE":
      return { ...base, amount: form.negative ? -amount : amount };
    case "FUNDING":
      return { ...base, amount, paymentMethod: form.paymentMethod };
    case "DEPOSIT_RETURN":
      return { ...base, amount, vendor: form.vendor || null, rentalId: form.rentalId || null, returnOfId: form.returnOfId || null };
    case "VENDOR_REFUND":
      return { ...base, amount, vendor: form.vendor || null, rentalId: form.rentalId || null };
    default:
      return {
        ...base,
        amount,
        category: form.category,
        vendor: form.vendor || null,
        liters: form.category === "FUEL" && form.liters ? toNumber(form.liters) : null,
        kilometers: form.category === "MILEAGE" && form.kilometers ? Math.round(toNumber(form.kilometers)) : null,
        personalAdvance: form.personalAdvance,
        rentalId: form.rentalId || null,
      };
  }
}


/**
 * Saisie d'une ligne du registre (spec 073) : la nature d'abord, puis les champs utiles. Le
 * justificatif se donne par **photo** (appareil photo du téléphone) ou par **document** existant
 * (scan, PDF, image de la galerie) : deux champs distincts, car `capture` empêche de choisir un
 * fichier sur mobile.
 */
export default function EntryForm({
  open,
  onClose,
  seed,
  manager,
  hasOpeningBalance,
  rentals,
  outstandingDeposits,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly seed: EntryFormSeed;
  readonly manager: boolean;
  readonly hasOpeningBalance: boolean;
  readonly rentals: readonly RentalOption[];
  readonly outstandingDeposits: readonly { id: string; date: string; amount: number; vendor: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const ids = useId();
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => initialState(seed));
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const editing = seed.mode === "edit";
  const existingReceipt = editing && seed.line.hasReceipt ? seed.line.receiptName ?? "Justificatif enregistré" : null;
  const kinds = availableKinds(manager, hasOpeningBalance);
  const receiptRequired = RECEIPT_REQUIRED.includes(form.kind);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > RECEIPT_MAX_BYTES) {
      toast.error("Le justificatif dépasse 10 Mo.");
      return;
    }
    setFile(f);
  }

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const amount = toNumber(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Indiquez un montant positif.");
      return;
    }
    if (receiptRequired && !file && !existingReceipt) {
      setError("Justificatif obligatoire : prenez une photo ou choisissez un document.");
      return;
    }
    const body = new FormData();
    body.append("data", JSON.stringify(buildPayload(form)));
    if (file) body.append("file", file);
    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/accounting/navette/entries/${seed.line.id}` : "/api/accounting/navette/entries",
        { method: editing ? "PATCH" : "POST", body }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Enregistrement impossible. Réessayez dans un instant.");
        return;
      }
      toast.success(editing ? "Ligne corrigée" : "Ligne enregistrée");
      onClose();
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? `Corriger : ${ENTRY_KIND_LABEL[form.kind]}` : "Nouvelle ligne";

  return (
    <Modal open={open} onClose={onClose} title={title} mobileLayout="sheet">
      <form onSubmit={submit} className="space-y-4">
        {!editing && !seed.returnOf && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-muted">Nature</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === k}
                  onClick={() => set("kind", k)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    form.kind === k ? "border-brand bg-brand-soft text-brand-text" : "border-control-line bg-surface text-ink-muted hover:bg-surface-sunken"
                  }`}
                >
                  {ENTRY_KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {form.kind === "EXPENSE" && (
          <Select
            label="Type de dépense"
            value={form.category}
            onChange={(e) => set("category", e.target.value as ShuttleExpenseCategory)}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Montant (€)"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0,00"
          />
          <Input label="Date" type="date" required value={form.date} max={isoToday()} onChange={(e) => set("date", e.target.value)} />
        </div>

        {form.kind === "OPENING_BALANCE" && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <Checkbox checked={form.negative} onChange={(e) => set("negative", e.target.checked)} />
            Solde négatif (la navette a avancé de l&apos;argent)
          </label>
        )}

        {form.kind === "FUNDING" && (
          <Select
            label="Mode de versement"
            value={form.paymentMethod}
            onChange={(e) => set("paymentMethod", e.target.value as ShuttlePaymentMethod)}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
          />
        )}

        {form.kind === "EXPENSE" && form.category === "FUEL" && (
          <Input label="Litres (facultatif)" inputMode="decimal" value={form.liters} onChange={(e) => set("liters", e.target.value)} />
        )}
        {form.kind === "EXPENSE" && form.category === "MILEAGE" && (
          <Input label="Kilomètres (facultatif)" inputMode="numeric" value={form.kilometers} onChange={(e) => set("kilometers", e.target.value)} />
        )}

        {(form.kind === "EXPENSE" || form.kind === "DEPOSIT_RETURN" || form.kind === "VENDOR_REFUND") && (
          <>
            <Input
              label="Fournisseur"
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              list={`${ids}-vendors`}
            />
            <datalist id={`${ids}-vendors`}>
              <option value={DEFAULT_VENDOR} />
            </datalist>
            {rentals.length > 0 && (
              <Select
                label="Location (facultatif)"
                value={form.rentalId}
                onChange={(e) => set("rentalId", e.target.value)}
                options={[
                  { value: "", label: "Aucune" },
                  ...rentals.slice(0, 30).map((r) => ({
                    value: r.id,
                    label: [r.vendor, r.vehicle, frDate(r.startDate)].filter(Boolean).join(" · "),
                  })),
                ]}
              />
            )}
          </>
        )}

        {form.kind === "DEPOSIT_RETURN" && (outstandingDeposits.length > 0 || form.returnOfId) && (
          <Select
            label="Caution restituée"
            value={form.returnOfId}
            onChange={(e) => set("returnOfId", e.target.value)}
            options={[
              { value: "", label: "Non précisée" },
              ...outstandingDeposits.map((d) => ({
                value: d.id,
                label: `${euro(d.amount)} · ${d.vendor ?? "—"} · ${frDate(d.date)}`,
              })),
              ...(form.returnOfId && !outstandingDeposits.some((d) => d.id === form.returnOfId)
                ? [{ value: form.returnOfId, label: "Caution liée" }]
                : []),
            ]}
          />
        )}

        <Textarea
          label={form.kind === "EXPENSE" && form.category === "OTHER" ? "Libellé" : "Commentaire (facultatif)"}
          required={form.kind === "EXPENSE" && form.category === "OTHER"}
          rows={2}
          maxLength={200}
          value={form.label}
          onChange={(e) => set("label", e.target.value)}
        />

        {form.kind === "EXPENSE" && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <Checkbox checked={form.personalAdvance} onChange={(e) => set("personalAdvance", e.target.checked)} />
            Payé avec mon argent personnel (avance à rembourser)
          </label>
        )}

        <fieldset
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={`rounded-card border border-dashed p-3 ${dragging ? "border-brand bg-brand-soft" : "border-control-line"}`}
        >
          <legend className="px-1 text-sm font-medium text-ink-muted">
            Justificatif{receiptRequired ? " (obligatoire)" : " (facultatif)"}
          </legend>
          {file ? (
            <div className="flex items-center gap-3">
              {file.type.startsWith("image/") ? (
                <ImageIcon aria-hidden="true" className="size-10 shrink-0 text-ink-muted" />
              ) : (
                <FileText aria-hidden="true" className="size-10 shrink-0 text-ink-muted" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-ink">{file.name}</span>
                <span className="text-[13px] text-ink-muted">{(file.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo</span>
              </span>
              <button
                type="button"
                aria-label="Retirer le justificatif"
                onClick={() => setFile(null)}
                className="grid size-11 place-items-center rounded-control text-ink-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={() => photoRef.current?.click()}>
                <Camera aria-hidden="true" className="size-4" /> Prendre une photo
              </Button>
              <Button type="button" variant="secondary" onClick={() => docRef.current?.click()}>
                <Upload aria-hidden="true" className="size-4" /> Choisir un document
              </Button>
            </div>
          )}
          <p className="mt-2 text-[13px] leading-[18px] text-ink-muted">
            {existingReceipt && !file
              ? `Déjà joint : ${existingReceipt}. Un nouveau fichier le remplacera.`
              : "Photo, scan ou PDF, 10 Mo au plus. Sur ordinateur, vous pouvez aussi glisser le fichier ici."}
          </p>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Photo du justificatif"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={docRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            aria-label="Document justificatif"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </fieldset>

        {!manager && !editing && (
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Vous pourrez corriger ou supprimer cette ligne pendant {AUTHOR_EDIT_WINDOW_HOURS} heures. La comptabilité est
            prévenue.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
