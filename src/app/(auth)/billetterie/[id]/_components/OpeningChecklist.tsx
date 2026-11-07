"use client";

import Link from "next/link";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import type { TicketingEventStatus } from "@/generated/prisma/enums";
import { useApi } from "../../use-api";
import type { ReadinessCheck } from "./readiness";

/**
 * Publication de l'événement : avant l'ouverture, ce qu'il reste à régler (bloquant ou conseillé)
 * et le bouton « Ouvrir les inscriptions » ; ensuite, fermer ou rouvrir d'un geste.
 */
export default function OpeningChecklist({
  eventId,
  status,
  checks,
}: {
  readonly eventId: string;
  readonly status: TicketingEventStatus;
  readonly checks: ReadinessCheck[];
}) {
  const { call, busy } = useApi();
  const setStatus = (next: TicketingEventStatus, message: string) => call(`/api/ticketing/events/${eventId}`, "PATCH", { status: next }, message);
  const missing = checks.filter((c) => c.required && !c.done);

  if (status === "ARCHIVED") return null;
  if (status !== "DRAFT") {
    const open = status === "OPEN";
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
        <p className="text-[15px] text-ink">
          {open ? "Les inscriptions sont ouvertes." : "Les inscriptions sont closes : la page publique reste visible, sans formulaire."}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => (open ? setStatus("CLOSED", "Inscriptions closes") : setStatus("OPEN", "Inscriptions rouvertes"))}
        >
          {open ? "Fermer les inscriptions" : "Rouvrir les inscriptions"}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Prêt à ouvrir ?</h2>
        <p className="text-[13px] text-ink-muted">L&apos;événement est en brouillon : personne ne peut encore s&apos;inscrire.</p>
      </div>
      <ul className="divide-y divide-line">
        {checks.map((c) => {
          const Icon = c.done ? CheckCircle2 : c.required ? CircleAlert : Circle;
          const tone = c.done ? "text-success" : c.required ? "text-warning" : "text-ink-subtle";
          return (
            <li key={c.key} className="flex items-start gap-3 py-2.5">
              <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${tone}`} />
              <span className="min-w-0 flex-1">
                <span className="text-[15px] text-ink">
                  {c.label}
                  {!c.required && !c.done && <span className="text-ink-muted"> (conseillé)</span>}
                </span>
                {c.detail && <span className="block text-[13px] text-ink-muted">{c.detail}</span>}
              </span>
              {!c.done && (
                <Link href={c.href} className="shrink-0 text-[13px] font-semibold text-brand-text underline-offset-2 hover:underline">
                  Régler
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <Button type="button" disabled={busy || missing.length > 0} onClick={() => setStatus("OPEN", "Inscriptions ouvertes")}>
        Ouvrir les inscriptions
      </Button>
      {missing.length > 0 && (
        <p className="text-[13px] text-ink-muted">
          Encore {missing.length} point{missing.length > 1 ? "s" : ""} à régler avant d&apos;ouvrir.
        </p>
      )}
    </section>
  );
}
