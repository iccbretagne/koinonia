"use client";

import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";

interface DomainView {
  key: string;
  label: string;
  description: string;
  /** Email (spec 053). */
  enabled: boolean;
  /** Sur les appareils (spec 068). */
  push: boolean;
}

interface PreferencesView {
  emailEnabled: boolean;
  hasEmail: boolean;
  pushEnabled: boolean;
  pushAvailable: boolean;
  domains: DomainView[];
}

function GlobalToggle({
  checked,
  onChange,
  title,
  hint,
}: {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly title: string;
  readonly hint: string;
}) {
  return (
    <label className="flex flex-1 basis-60 cursor-pointer items-start gap-3">
      <Checkbox className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[15px] font-semibold leading-[22px] text-ink">{title}</span>
        <span className="block text-[13px] leading-[18px] text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

function ChannelToggle({
  label,
  checked,
  disabled,
  onChange,
  domainLabel,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
  readonly domainLabel: string;
}) {
  return (
    <label className={`flex min-h-11 items-center gap-2 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={`${label} : ${domainLabel}`}
      />
      <span className="text-[13px] font-medium leading-[18px] text-ink-muted" aria-hidden="true">
        {label}
      </span>
    </label>
  );
}

/**
 * Choix par domaine des canaux de notification (specs 053 et 068) : email et appareils, chacun
 * avec son interrupteur général. La cloche de l'application n'est jamais coupée.
 */
export default function NotificationPreferencesClient({ initialView }: { readonly initialView: PreferencesView }) {
  const toast = useToast();
  const [emailEnabled, setEmailEnabled] = useState(initialView.emailEnabled);
  const [pushEnabled, setPushEnabled] = useState(initialView.pushEnabled);
  const [domains, setDomains] = useState(initialView.domains);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const showPush = initialView.pushAvailable;

  function changed() {
    setSaved(false);
  }

  function toggleDomain(key: string, channel: "enabled" | "push", value: boolean) {
    setDomains((prev) => prev.map((d) => (d.key === key ? { ...d, [channel]: value } : d)));
    changed();
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled,
          domains: Object.fromEntries(domains.map((d) => [d.key, d.enabled])),
          ...(showPush
            ? { pushEnabled, pushDomains: Object.fromEntries(domains.map((d) => [d.key, d.push])) }
            : {}),
        }),
      });
      if (res.ok) {
        const data: PreferencesView = await res.json();
        setEmailEnabled(data.emailEnabled);
        setPushEnabled(data.pushEnabled);
        setDomains(data.domains);
        setSaved(true);
        toast.success("Préférences enregistrées");
      } else {
        toast.error("Enregistrement impossible. Réessayez dans un instant.");
      }
    } catch {
      toast.error("Enregistrement impossible. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="channel-prefs-title" className="flex flex-col gap-3">
      <h2 id="channel-prefs-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
        {showPush ? "Email et appareils" : "Emails"}
      </h2>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        {!initialView.hasEmail && (
          <Alert tone="warning">
            Aucune adresse email sur votre compte : les réglages email resteront sans effet tant qu&apos;aucune
            adresse n&apos;est disponible.
          </Alert>
        )}

        <div className="flex flex-wrap gap-4 border-b border-line pb-4">
          <GlobalToggle
            checked={emailEnabled}
            onChange={(v) => {
              setEmailEnabled(v);
              changed();
            }}
            title="Recevoir des emails de Koinonia"
            hint="Coupe tous les emails ci-dessous."
          />
          {showPush && (
            <GlobalToggle
              checked={pushEnabled}
              onChange={(v) => {
                setPushEnabled(v);
                changed();
              }}
              title="Recevoir les notifications sur mes appareils"
              hint="Coupe toutes les notifications natives, sur tous vos appareils."
            />
          )}
        </div>
        <p className="-mt-2 text-[13px] leading-[18px] text-ink-muted">
          Les notifications dans l&apos;application continuent dans tous les cas.
        </p>

        <ul className="flex flex-col divide-y divide-line">
          {domains.map((domain) => (
            <li key={domain.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-[22px] text-ink">{domain.label}</p>
                <p className="text-[13px] leading-[18px] text-ink-muted">{domain.description}</p>
              </div>
              <div className="flex shrink-0 gap-5">
                <ChannelToggle
                  label="Email"
                  domainLabel={domain.label}
                  checked={domain.enabled}
                  disabled={!emailEnabled}
                  onChange={(v) => toggleDomain(domain.key, "enabled", v)}
                />
                {showPush && (
                  <ChannelToggle
                    label="Appareil"
                    domainLabel={domain.label}
                    checked={domain.push}
                    disabled={!pushEnabled}
                    onChange={(v) => toggleDomain(domain.key, "push", v)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {saved && <span className="text-sm text-success">Préférences enregistrées.</span>}
        </div>
      </div>
    </section>
  );
}
