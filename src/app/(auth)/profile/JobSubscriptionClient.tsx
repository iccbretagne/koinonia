"use client";

import { useState, useEffect } from "react";

interface Subscription {
  id: string;
  inApp: boolean;
  email: boolean;
  wantEmploi: boolean;
  wantStage: boolean;
  wantAlternance: boolean;
  wantSeekers: boolean;
}

export default function JobSubscriptionClient() {
  const [sub,     setSub]     = useState<Subscription | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    fetch("/api/jobs/subscription")
      .then((r) => r.json())
      .then((data) => { setSub(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function update(patch: Partial<Subscription>) {
    if (!sub) return;
    const next = { ...sub, ...patch };
    setSub(next);
    setSaving(true);
    try {
      const res = await fetch("/api/jobs/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setSub(data);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Notifications — Emploi</h2>
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    );
  }

  if (!sub) return null;

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Notifications — Emploi</h2>
      <p className="text-xs text-gray-400 mb-5">Recevez une notification quand une offre ou un profil de recherche est publié.</p>

      {/* Channels */}
      <div className="space-y-3 mb-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.inApp}
            onChange={(e) => update({ inApp: e.target.checked })}
            disabled={saving}
            className="w-4 h-4 text-icc-violet rounded accent-icc-violet"
          />
          <div>
            <span className="text-sm font-medium text-gray-800">Notification dans l&apos;app</span>
            <p className="text-xs text-gray-400">Badge sur la cloche de notifications</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.email}
            onChange={(e) => update({ email: e.target.checked })}
            disabled={saving}
            className="w-4 h-4 text-icc-violet rounded accent-icc-violet"
          />
          <div>
            <span className="text-sm font-medium text-gray-800">Email</span>
            <p className="text-xs text-gray-400">Envoyé à votre adresse Google</p>
          </div>
        </label>
      </div>

      {/* Types */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Types d&apos;offres</p>
      <div className="flex flex-wrap gap-3">
        {([
          { key: "wantEmploi",     label: "Emploi" },
          { key: "wantStage",      label: "Stage" },
          { key: "wantAlternance", label: "Alternance" },
          { key: "wantSeekers",    label: "Profils en recherche" },
        ] as const).map(({ key, label }) => (
          <label
            key={key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 cursor-pointer transition-colors text-sm font-medium ${
              sub[key]
                ? "border-icc-violet bg-icc-violet/10 text-icc-violet"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            <input
              type="checkbox"
              checked={sub[key]}
              onChange={(e) => update({ [key]: e.target.checked })}
              disabled={saving}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
      {saving && <p className="text-xs text-gray-400 mt-3">Enregistrement…</p>}
    </div>
  );
}
