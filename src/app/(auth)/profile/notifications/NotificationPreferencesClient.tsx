"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

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
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
      {!initialView.hasEmail && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Aucune adresse email sur votre compte : ces réglages resteront sans effet tant qu&apos;aucune
          adresse n&apos;est disponible.
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer mb-5 pb-5 border-b border-gray-100">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(e) => toggleGlobal(e.target.checked)}
          className="w-4 h-4 text-icc-violet rounded accent-icc-violet"
        />
        <div>
          <span className="text-sm font-medium text-gray-900">Recevoir des emails de Koinonia</span>
          <p className="text-xs text-gray-400">
            Coupe tous les emails ci-dessous ; les notifications dans l&apos;app continuent.
          </p>
        </div>
      </label>

      <div className="space-y-3 mb-5">
        {domains.map((domain) => (
          <label
            key={domain.key}
            className={`flex items-center gap-3 ${emailEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
          >
            <input
              type="checkbox"
              checked={domain.enabled}
              onChange={(e) => toggleDomain(domain.key, e.target.checked)}
              disabled={!emailEnabled}
              className="w-4 h-4 text-icc-violet rounded accent-icc-violet"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">{domain.label}</span>
              <p className="text-xs text-gray-400">{domain.description}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved && <span className="text-sm text-green-600">Préférences enregistrées.</span>}
      </div>
    </div>
  );
}
