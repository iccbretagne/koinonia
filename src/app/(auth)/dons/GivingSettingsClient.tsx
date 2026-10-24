"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { GivingSettings } from "@/modules/giving";
import {
  formatIban,
  givingPageSchema,
  ibanError,
  missingForDisplay,
  normalizeIban,
  toPublicGivingPage,
  type GivingPageContent,
} from "@/modules/giving/schemas";
import { Alert, Button, ConfirmModal, Input, Textarea, useToast } from "@/components/ui";
import GivingPageView from "@/app/donner/_components/GivingPageView";
import GivingPageHeader from "@/app/donner/_components/GivingPageHeader";
import type { GivingNameSize } from "@/generated/prisma/enums";
import Section from "./Section";
import LogoUpload, { settingsLogoSrc } from "./LogoUpload";
import SupportIdentity, { type IdentitySettings } from "./SupportIdentity";
import PublicationBlock from "./PublicationBlock";
import SlideSettings from "./SlideSettings";
import SlidePreview from "./SlidePreview";
import { isDirty, toDraft, toPreviewContent, type Draft, type TextKey } from "./settings-state";
import { useLeaveGuard } from "./use-leave-guard";

type Errors = Partial<Record<keyof GivingPageContent, string>>;
export type Support = "page" | "slide";

/** Champs réglés dans l'onglet Slide : un refus qui ne porte que sur eux y ramène. */
const SLIDE_FIELDS: ReadonlySet<string> = new Set(["shortUrl", "slideChurchNameShown", "slideChurchNameSize", "slideLogoShown"]);
const IDENTITY_ID = "giving-identity";
const VERSE_ID = "giving-verse";

/** Réglages du nom et du logo d'un support, lus dans le brouillon (spec 066). */
function identityOf(draft: Draft, support: Support): IdentitySettings {
  return {
    logoShown: draft[`${support}LogoShown`],
    nameShown: draft[`${support}ChurchNameShown`],
    nameSize: draft[`${support}ChurchNameSize`] as GivingNameSize,
  };
}

function withIdentity(draft: Draft, support: Support, patch: Partial<IdentitySettings>): Draft {
  const next = { ...draft };
  if (patch.logoShown !== undefined) next[`${support}LogoShown`] = patch.logoShown;
  if (patch.nameShown !== undefined) next[`${support}ChurchNameShown`] = patch.nameShown;
  if (patch.nameSize !== undefined) next[`${support}ChurchNameSize`] = patch.nameSize;
  return next;
}

function issuesToErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "") as keyof GivingPageContent;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** « le bénéficiaire et l'IBAN sont vides » : explique une section activée absente de l'aperçu. */
function missingNotice(labels: readonly string[] | undefined): string | undefined {
  if (!labels?.length) return undefined;
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}` : labels[0];
  return `Absente de la page publique tant que ${list} ${labels.length > 1 ? "sont vides" : "est vide"}.`;
}

/**
 * Paramétrage de la page de dons (specs 065-067) : publication en tête, un onglet par support
 * (page publique, slide) qui pilote le formulaire et l'aperçu, signal des modifications non
 * enregistrées et garde à la sortie. La validation est la même que celle de l'API.
 */
export default function GivingSettingsClient({
  settings,
  churchSettingsHref,
  initialSupport,
}: {
  readonly settings: GivingSettings;
  /** Lien vers les paramètres de l'église, si l'utilisateur peut les modifier. */
  readonly churchSettingsHref: string | null;
  readonly initialSupport: Support;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState<Draft>(() => toDraft(settings.content));
  const [configured, setConfigured] = useState(settings.configured);
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [support, setSupport] = useState<Support>(initialSupport);
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [logoVersion, setLogoVersion] = useState(settings.logoVersion);

  const savedEnabled = configured && saved.enabled;
  const dirty = useMemo(() => isDirty(draft, saved), [draft, saved]);
  const guard = useLeaveGuard(dirty);

  const logoSrc = settingsLogoSrc(settings.churchId, logoVersion);
  const previewContent = useMemo(() => toPreviewContent(draft), [draft]);
  const preview = useMemo(
    () => toPublicGivingPage(settings.churchName, previewContent, logoSrc),
    [previewContent, settings.churchName, logoSrc]
  );
  const missing = useMemo(() => missingForDisplay(previewContent), [previewContent]);

  function selectSupport(next: Support) {
    setSupport(next);
    // Mémorisé dans l'adresse (rechargement, lien « Paramétrage » de la slide), sans historique.
    const url = new URL(window.location.href);
    if (next === "slide") url.searchParams.set("support", "slide");
    else url.searchParams.delete("support");
    window.history.replaceState(window.history.state, "", url);
  }

  /** Renvoi depuis l'onglet Slide : afficher l'onglet Page, puis défiler jusqu'à la cible. */
  function goToPage(target: string) {
    flushSync(() => {
      selectSupport("page");
      setMobileView("form");
    });
    const el = document.getElementById(target);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }

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

  /** Affiche les erreurs, et l'onglet qui les porte si l'onglet courant n'en a aucune. */
  function showErrors(next: Errors) {
    setErrors(next);
    const fields = Object.keys(next);
    const onSlide = fields.some((f) => SLIDE_FIELDS.has(f));
    const onPage = fields.some((f) => !SLIDE_FIELDS.has(f));
    if (support === "page" && onSlide && !onPage) selectSupport("slide");
    if (support === "slide" && onPage && !onSlide) selectSupport("page");
    setMobileView("form");
  }

  async function save() {
    const parsed = givingPageSchema.safeParse({ churchId: settings.churchId, ...draft });
    if (!parsed.success) {
      showErrors(issuesToErrors(parsed.error.issues));
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
          showErrors(
            issuesToErrors(body.details.map((d: { field: string; message: string }) => ({ path: [d.field.split(".")[0]], message: d.message })))
          );
        }
        toast.error(body.error ?? "Enregistrement impossible. Réessaie dans un instant.");
        return;
      }
      const next = toDraft(body as GivingPageContent);
      setSaved(next);
      setDraft(next);
      setConfigured(true);
      setErrors({});
      toast.success("Page de dons enregistrée");
    } catch {
      toast.error("Enregistrement impossible. Réessaie dans un instant.");
    } finally {
      setSaving(false);
    }
  }

  const toggleClass = (active: boolean) =>
    `flex-1 rounded-control px-3 py-2 text-sm font-semibold ${active ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`;
  const tabClass = (active: boolean) =>
    `-mb-px min-h-[44px] border-b-2 px-3 font-display text-sm font-semibold transition-colors ${
      active ? "border-brand text-brand-text" : "border-transparent text-ink-muted hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <PublicationBlock
        savedEnabled={savedEnabled}
        draftEnabled={draft.enabled}
        onToggle={(v) => set("enabled", v)}
        publicUrl={settings.publicUrl}
      />

      {!settings.hasAccountingEmails && (
        <Alert tone="warning" title="Aucune adresse comptable configurée.">
          Les alertes de changement de coordonnées iront aux Admins de l&apos;église.{" "}
          {churchSettingsHref ? (
            <>
              Ajoute l&apos;adresse de la comptabilité dans les{" "}
              <Link href={churchSettingsHref} className="font-semibold text-brand-text underline underline-offset-2">
                paramètres de l&apos;église
              </Link>
              .
            </>
          ) : (
            "Demande à un Admin de l'église d'ajouter l'adresse de la comptabilité dans ses paramètres."
          )}
        </Alert>
      )}

      <div role="tablist" aria-label="Support" className="flex gap-2 border-b border-line">
        {(
          [
            ["page", "Page publique"],
            ["slide", "Slide de projection"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`support-tab-${value}`}
            aria-selected={support === value}
            aria-controls="support-panel"
            className={tabClass(support === value)}
            onClick={() => selectSupport(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <fieldset className="flex gap-1 rounded-control bg-surface-sunken p-1 lg:hidden">
        <legend className="sr-only">Affichage</legend>
        <button type="button" aria-pressed={mobileView === "form"} className={toggleClass(mobileView === "form")} onClick={() => setMobileView("form")}>
          Paramètres
        </button>
        <button type="button" aria-pressed={mobileView === "preview"} className={toggleClass(mobileView === "preview")} onClick={() => setMobileView("preview")}>
          Aperçu
        </button>
      </fieldset>

      <div
        id="support-panel"
        role="tabpanel"
        aria-labelledby={`support-tab-${support}`}
        className={`grid gap-6 lg:items-start ${
          support === "slide" ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
          className={`flex flex-col gap-4 ${mobileView === "form" ? "" : "hidden lg:flex"}`}
        >
          {support === "page" ? (
            <>
              <Section title="Introduction">
                <Textarea label="Introduction" rows={3} {...text("intro")} />
              </Section>

              <Section title="Don en ligne" notice={missingNotice(missing.online)} toggle={{ checked: draft.onlineEnabled, onChange: (v) => set("onlineEnabled", v) }}>
                <Input label="Lien de don en ligne" type="url" placeholder="https://" {...text("onlineUrl")} />
                <Textarea label="Explication" rows={2} {...text("onlineDescription")} />
                <Input label="Note sous le bouton" {...text("onlineNote")} />
              </Section>

              <Section title="Virement bancaire" notice={missingNotice(missing.transfer)} toggle={{ checked: draft.transferEnabled, onChange: (v) => set("transferEnabled", v) }}>
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

              <Section title="Sur place, au culte" notice={missingNotice(missing.onsite)} toggle={{ checked: draft.onsiteEnabled, onChange: (v) => set("onsiteEnabled", v) }}>
                <Input label="Ordre des chèques" {...text("checkPayee")} />
                <Textarea label="Consigne" rows={2} {...text("onsiteText")} />
              </Section>

              <Section title="Reçu fiscal" notice={missingNotice(missing.taxReceipt)} toggle={{ checked: draft.taxReceiptEnabled, onChange: (v) => set("taxReceiptEnabled", v) }}>
                <Textarea label="Texte" rows={4} {...text("taxReceiptText")} />
              </Section>

              <Section id={IDENTITY_ID} title="Nom et logo de l'église" description="Le logo sert aussi à la slide ; son affichage s'y règle à part.">
                <LogoUpload churchId={settings.churchId} logoVersion={logoVersion} onLogoChange={setLogoVersion} />
                <SupportIdentity
                  support="Page publique"
                  value={identityOf(draft, "page")}
                  hasLogo={Boolean(logoVersion)}
                  onChange={(patch) => setDraft((d) => withIdentity(d, "page", patch))}
                />
              </Section>

              <Section title="Verset et pied de page" description="Le verset apparaît aussi en bas de la slide.">
                <Textarea id={VERSE_ID} label="Verset" rows={2} {...text("verseText")} />
                <Input label="Référence du verset" {...text("verseReference")} />
                <Input label="Email de contact" type="email" {...text("contactEmail")} />
                <Input label="Adresse" {...text("address")} />
                <Input label="Réseaux sociaux" placeholder="@" {...text("socialHandle")} />
              </Section>
            </>
          ) : (
            <SlideSettings
              identity={identityOf(draft, "slide")}
              onIdentityChange={(patch) => setDraft((d) => withIdentity(d, "slide", patch))}
              logoSrc={logoSrc}
              verse={previewContent.verseText ? { text: previewContent.verseText, reference: previewContent.verseReference } : null}
              shortUrl={text("shortUrl")}
              onEditLogo={() => goToPage(IDENTITY_ID)}
              onEditVerse={() => goToPage(VERSE_ID)}
            />
          )}

          {/* Au-dessus de la barre du bas sur mobile (64 px + bordure, comme BulkActionBar). */}
          <div className="sticky bottom-[calc(65px+env(safe-area-inset-bottom))] -mx-1 flex items-center justify-between gap-3 border-t border-line bg-bg px-1 py-3 md:bottom-0">
            <p role="status" className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px]">
              {dirty ? (
                <>
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning" />
                  <span className="font-semibold text-ink">Modifications non enregistrées</span>
                </>
              ) : (
                <span className="text-ink-muted">Tout est enregistré</span>
              )}
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>

        <aside
          aria-label={support === "page" ? "Aperçu de la page publique" : "Aperçu de la slide"}
          className={`lg:sticky lg:top-4 ${mobileView === "preview" ? "" : "hidden lg:block"}`}
        >
          <p className="mb-2 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-subtle">
            {support === "page" ? "Aperçu de la page" : "Aperçu de la slide"}
            {draft.enabled ? "" : " — non publiée"}
          </p>
          {support === "page" ? (
            <div className="overflow-hidden rounded-card border border-line bg-surface-sunken">
              <div className="bg-brand px-4 py-4">
                <GivingPageHeader
                  churchName={preview.churchName}
                  nameSize={preview.churchNameSize}
                  logoSrc={preview.logo?.src ?? null}
                  compact
                />
              </div>
              <div className="p-4">
                <GivingPageView page={preview} />
              </div>
            </div>
          ) : (
            <>
              <SlidePreview content={previewContent} churchName={settings.churchName} publicUrl={settings.publicUrl} logoSrc={logoSrc} />
              <p className="mt-2 text-[13px] leading-[18px] text-ink-muted">
                {savedEnabled
                  ? "Telle qu'elle sera projetée après enregistrement."
                  : "La slide plein écran sera disponible une fois la page publiée et enregistrée."}
              </p>
            </>
          )}
        </aside>
      </div>

      <ConfirmModal
        open={guard.pendingHref !== null}
        title="Quitter sans enregistrer ?"
        message="Tes modifications de la page de dons seront perdues. Le logo, lui, est déjà enregistré."
        confirmLabel="Quitter sans enregistrer"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      />
    </div>
  );
}
