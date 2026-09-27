"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import Checkbox from "@/components/ui/Checkbox";
import Skeleton from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface Subscription {
  id: string;
  inApp: boolean;
  email: boolean;
  wantEmploi: boolean;
  wantStage: boolean;
  wantAlternance: boolean;
  wantSeekers: boolean;
  wantFreelanceMissions: boolean;
  wantFreelanceProfiles: boolean;
}

export default function JobSubscriptionClient() {
  const toast = useToast();
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
      } else {
        toast.error("Réglage non enregistré. Réessayez dans un instant.");
      }
    } catch {
      toast.error("Réglage non enregistré. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  }

  const heading = (
    <div>
      <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Emploi</h2>
      <p className="text-[13px] leading-[18px] text-ink-muted">
        Soyez prévenu quand une offre, un profil de recherche ou une mission freelance est publié.
      </p>
    </div>
  );

  if (!loaded) {
    return (
      <section className="flex flex-col gap-3" aria-busy="true">
        {heading}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
    );
  }

  if (!sub) return null;

  const channels = [
    { key: "inApp" as const, label: "Notification dans l'application", hint: "Pastille sur la cloche de notifications" },
    { key: "email" as const, label: "Email", hint: "Envoyé à votre adresse Google" },
  ];

  return (
    <section className="flex flex-col gap-3">
      {heading}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-1">
          {channels.map(({ key, label, hint }) => (
            <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
              <Checkbox
                className="mt-0.5"
                checked={sub[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
                disabled={saving}
              />
              <span>
                <span className="block text-[15px] font-medium leading-[22px] text-ink">{label}</span>
                <span className="block text-[13px] leading-[18px] text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
          <legend className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Types d&apos;offres</legend>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "wantEmploi",            label: "Emploi" },
              { key: "wantStage",             label: "Stage" },
              { key: "wantAlternance",        label: "Alternance" },
              { key: "wantSeekers",           label: "Profils en recherche" },
              { key: "wantFreelanceMissions", label: "Missions freelance" },
              { key: "wantFreelanceProfiles", label: "Freelances disponibles" },
            ] as const).map(({ key, label }) => (
              <label
                key={key}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-120
                  has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                    sub[key]
                      ? "border-brand bg-brand-soft text-brand-text"
                      : "border-control-line text-ink-muted hover:border-brand hover:text-ink"
                  }`}
              >
                <input
                  type="checkbox"
                  checked={sub[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                  disabled={saving}
                  className="sr-only"
                />
                {sub[key] && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {saving && <p className="text-xs text-ink-muted" aria-live="polite">Enregistrement…</p>}
      </div>
    </section>
  );
}
