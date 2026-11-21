"use client";

import { useEffect, useState } from "react";

/** Compte à rebours jusqu'au début de l'événement ; rien tant que la page n'est pas montée. */
export default function Countdown({ target }: { readonly target: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  const left = Math.max(0, new Date(target).getTime() - now);
  if (left === 0) return null;
  const units: [number, string][] = [
    [Math.floor(left / 86_400_000), "jours"],
    [Math.floor(left / 3_600_000) % 24, "heures"],
    [Math.floor(left / 60_000) % 60, "minutes"],
    [Math.floor(left / 1000) % 60, "secondes"],
  ];
  return (
    <dl className="flex justify-center gap-4" aria-label="Compte à rebours">
      {units.map(([value, label]) => (
        <div key={label} className="min-w-14 text-center">
          <dt className="sr-only">{label}</dt>
          <dd className="text-3xl font-bold tabular-nums" style={{ fontFamily: "var(--site-font-heading)" }}>{value}</dd>
          <span aria-hidden="true" className="text-xs uppercase tracking-wide">{label}</span>
        </div>
      ))}
    </dl>
  );
}
