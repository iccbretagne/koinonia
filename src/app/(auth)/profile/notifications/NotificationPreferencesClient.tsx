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
  enabled: boolean;
}

interface PreferencesView {
  emailEnabled: boolean;
  hasEmail: boolean;
  domains: DomainView[];
}

export default function NotificationPreferencesClient({ initialView }: { readonly initialView: PreferencesView }) {
  const toast = useToast();
  const [emailEnabled, setEmailEnabled] = useState(initialView.emailEnabled);
  const [domains, setDomains] = useState(initialView.domains);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleGlobal(value: boolean) {
    setEmailEnabled(value);
    setSaved(false);
  }

  function toggleDomain(key: string, value: boolean) {
    setDomains((prev) => prev.map((d) => (d.key === key ? { ...d, enabled: value } : d)));
    setSaved(false);
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
        }),
      });
      if (res.ok) {
        const data: PreferencesView = await res.json();
        setEmailEnabled(data.emailEnabled);
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
    <section aria-labelledby="email-prefs-title" className="flex flex-col gap-3">
      <h2 id="email-prefs-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
        Emails
      </h2>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        {!initialView.hasEmail && (
          <Alert tone="warning">
            Aucune adresse email sur votre compte : ces réglages resteront sans effet tant qu&apos;aucune
            adresse n&apos;est disponible.
          </Alert>
        )}

        <label className="flex cursor-pointer items-start gap-3 border-b border-line pb-4">
          <Checkbox
            className="mt-0.5"
            checked={emailEnabled}
            onChange={(e) => toggleGlobal(e.target.checked)}
          />
          <span>
            <span className="block text-[15px] font-semibold leading-[22px] text-ink">Recevoir des emails de Koinonia</span>
            <span className="block text-[13px] leading-[18px] text-ink-muted">
              Coupe tous les emails ci-dessous ; les notifications dans l&apos;application continuent.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1">
          {domains.map((domain) => (
            <label
              key={domain.key}
              className={`flex min-h-11 items-start gap-3 rounded-chip py-1.5 ${emailEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}
            >
              <Checkbox
                className="mt-0.5"
                checked={domain.enabled}
                onChange={(e) => toggleDomain(domain.key, e.target.checked)}
                disabled={!emailEnabled}
              />
              <span>
                <span className="block text-[15px] font-medium leading-[22px] text-ink">{domain.label}</span>
                <span className="block text-[13px] leading-[18px] text-ink-muted">{domain.description}</span>
              </span>
            </label>
          ))}
        </div>

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
