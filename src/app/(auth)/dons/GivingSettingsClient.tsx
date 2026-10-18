"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Presentation } from "lucide-react";
import type { GivingSettings } from "@/modules/giving";
import {
  formatIban,
  givingPageSchema,
  ibanError,
  normalizeIban,
  toPublicGivingPage,
  type GivingPageContent,
} from "@/modules/giving/schemas";
import { Alert, Button, Input, Textarea, useToast } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import GivingPageView from "@/app/donner/_components/GivingPageView";

type BoolKey = {
  [K in keyof GivingPageContent]: GivingPageContent[K] extends boolean ? K : never;
}[keyof GivingPageContent];
type TextKey = Exclude<keyof GivingPageContent, BoolKey>;
type Draft = Record<BoolKey, boolean> & Record<TextKey, string>;
type Errors = Partial<Record<keyof GivingPageContent, string>>;

const BOOL_KEYS: readonly BoolKey[] = ["enabled", "onlineEnabled", "transferEnabled", "onsiteEnabled", "taxReceiptEnabled"];

function toDraft(content: GivingPageContent): Draft {
  const draft = {} as Record<string, string | boolean>;
  for (const [key, value] of Object.entries(content)) {
    if (BOOL_KEYS.includes(key as BoolKey)) draft[key] = Boolean(value);
    else if (key === "iban") draft[key] = value ? formatIban(String(value)) : "";
    else draft[key] = (value as string | null) ?? "";
  }
  return draft as Draft;
}

/** Contenu de l'aperçu : textes vides → absents, IBAN normalisé (sans validation bloquante). */
function toPreviewContent(draft: Draft): GivingPageContent {
  const content = {} as Record<string, string | boolean | null>;
  for (const [key, value] of Object.entries(draft)) {
    if (typeof value === "boolean") content[key] = value;
    else content[key] = value.trim() === "" ? null : value.trim();
  }
  if (content.iban) content.iban = normalizeIban(String(content.iban));
  return content as unknown as GivingPageContent;
}

function issuesToErrors(issues: readonly { path: readonly (string | number)[]; message: string }[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "") as keyof GivingPageContent;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function Switch({
  checked,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        checked ? "bg-brand" : "bg-control-line"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-surface transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function Section({
  title,
  description,
  toggle,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly toggle?: { readonly checked: boolean; readonly onChange: (next: boolean) => void };
  readonly children?: ReactNode;
}) {
  const open = toggle ? toggle.checked : true;
  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{description}</p>}
        </div>
        {toggle && <Switch checked={toggle.checked} onChange={toggle.onChange} label={`Afficher : ${title}`} />}
      </div>
      {open && children && <div className="mt-4 flex flex-col gap-4">{children}</div>}
    </section>
  );
}

/**
 * Paramétrage de la page de dons (spec 065) : une section par bloc, aperçu en direct (colonne à
 * droite sur grand écran, onglet sur mobile). La validation est la même que celle de l'API.
 */
export default function GivingSettingsClient({ settings }: { readonly settings: GivingSettings }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings.content));
  const [savedEnabled, setSavedEnabled] = useState(settings.configured && settings.content.enabled);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");

  const preview = useMemo(() => toPublicGivingPage(settings.churchName, toPreviewContent(draft)), [draft, settings.churchName]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function text(key: TextKey) {
    return {
      value: draft[key],
      error: errors[key],
      onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    };
  }

  function onIbanBlur() {
    const raw = draft.iban.trim();
    if (!raw) return;
    const error = ibanError(normalizeIban(raw));
    if (error) setErrors((e) => ({ ...e, iban: error }));
    else set("iban", formatIban(normalizeIban(raw)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = givingPageSchema.safeParse({ churchId: settings.churchId, ...draft });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      toast.error("Corrige les champs signalés : rien n'a été enregistré.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/giving", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ churchId: settings.churchId, ...draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(body.details)) {
          setErrors(
            issuesToErrors(body.details.map((d: { field: string; message: string }) => ({ path: [d.field.split(".")[0]], message: d.message })))
          );
        }
        toast.error(body.error ?? "Enregistrement impossible. Réessaie dans un instant.");
        return;
      }
      const saved = body as GivingPageContent;
      setDraft(toDraft(saved));
      setSavedEnabled(saved.enabled);
      setErrors({});
      toast.success("Page de dons enregistrée");
    } catch {
      toast.error("Enregistrement impossible. Réessaie dans un instant.");
    } finally {
      setSaving(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-control px-3 py-2 text-sm font-semibold ${active ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`;

  return (
    <div className="flex flex-col gap-4">
      {!settings.hasAccountingEmails && (
        <Alert tone="warning" title="Aucune adresse comptable configurée.">
          Les alertes de changement de coordonnées iront aux Admins de l&apos;église. Ajoute l&apos;adresse de la
          comptabilité dans les paramètres de l&apos;église.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a href={settings.publicUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
          <ExternalLink aria-hidden="true" className="size-4" />
          Voir la page publique
        </a>
        {savedEnabled ? (
          <Link href="/dons/slide" className={buttonClasses("secondary")}>
            <Presentation aria-hidden="true" className="size-4" />
            Slide de projection
          </Link>
        ) : (
          <span aria-disabled="true" title="Active et enregistre la page d'abord" className={buttonClasses("secondary")}>
            <Presentation aria-hidden="true" className="size-4" />
            Slide de projection
          </span>
        )}
      </div>

      <div className="flex gap-1 rounded-control bg-surface-sunken p-1 lg:hidden" role="group" aria-label="Affichage">
        <button type="button" aria-pressed={mobileView === "form"} className={tabClass(mobileView === "form")} onClick={() => setMobileView("form")}>
          Paramètres
        </button>
        <button type="button" aria-pressed={mobileView === "preview"} className={tabClass(mobileView === "preview")} onClick={() => setMobileView("preview")}>
          Aperçu
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
        <form onSubmit={onSubmit} noValidate className={`flex flex-col gap-4 ${mobileView === "form" ? "" : "hidden lg:flex"}`}>
          <Section
            title="Page active"
            description="Inactive, la page publique affiche « Cette page n'est pas disponible »."
            toggle={{ checked: draft.enabled, onChange: (v) => set("enabled", v) }}
          >
            <Textarea label="Introduction" rows={3} {...text("intro")} />
          </Section>

          <Section title="Don en ligne" toggle={{ checked: draft.onlineEnabled, onChange: (v) => set("onlineEnabled", v) }}>
            <Input label="Lien de don en ligne" type="url" placeholder="https://" {...text("onlineUrl")} />
            <Textarea label="Explication" rows={2} {...text("onlineDescription")} />
            <Input label="Note sous le bouton" {...text("onlineNote")} />
          </Section>

          <Section title="Virement bancaire" toggle={{ checked: draft.transferEnabled, onChange: (v) => set("transferEnabled", v) }}>
            <Input label="Bénéficiaire" {...text("beneficiary")} />
            <Input
              label="IBAN"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              hint="Vérifié à l'enregistrement (longueur et clé de contrôle)."
              onBlur={onIbanBlur}
              {...text("iban")}
            />
            <Input label="BIC" autoComplete="off" spellCheck={false} className="font-mono" {...text("bic")} />
            <Input
              label="Libellé du virement"
              hint="« Prénom Nom » est mis en valeur pour que le donateur le remplace."
              {...text("transferReference")}
            />
          </Section>

          <Section title="Sur place, au culte" toggle={{ checked: draft.onsiteEnabled, onChange: (v) => set("onsiteEnabled", v) }}>
            <Input label="Ordre des chèques" {...text("checkPayee")} />
            <Textarea label="Consigne" rows={2} {...text("onsiteText")} />
          </Section>

          <Section title="Reçu fiscal" toggle={{ checked: draft.taxReceiptEnabled, onChange: (v) => set("taxReceiptEnabled", v) }}>
            <Textarea label="Texte" rows={4} {...text("taxReceiptText")} />
          </Section>

          <Section title="Verset et pied de page" description="Le verset apparaît aussi en bas de la slide.">
            <Textarea label="Verset" rows={2} {...text("verseText")} />
            <Input label="Référence du verset" {...text("verseReference")} />
            <Input label="Email de contact" type="email" {...text("contactEmail")} />
            <Input label="Adresse" {...text("address")} />
            <Input label="Réseaux sociaux" placeholder="@" {...text("socialHandle")} />
          </Section>

          <Section title="Slide de projection">
            <Input
              label="Adresse courte (facultative)"
              type="url"
              placeholder="https://"
              hint="Elle est écrite sous le QR code. Sans elle, la slide n'affiche que le QR code, qui mène à la page Koinonia."
              {...text("shortUrl")}
            />
          </Section>

          <div className="sticky bottom-0 -mx-1 flex justify-end bg-bg/90 px-1 py-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>

        <aside
          aria-label="Aperçu de la page publique"
          className={`lg:sticky lg:top-4 ${mobileView === "preview" ? "" : "hidden lg:block"}`}
        >
          <p className="mb-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
            Aperçu {draft.enabled ? "" : "— page inactive"}
          </p>
          <div className="overflow-hidden rounded-card border border-line bg-surface-sunken">
            <div className="bg-brand px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-on-brand/70">{settings.churchName}</p>
              <p className="font-display text-[22px] font-bold leading-7 text-on-brand">Donner</p>
            </div>
            <div className="p-4">
              <GivingPageView page={preview} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
