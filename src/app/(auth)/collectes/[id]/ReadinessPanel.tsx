import { CircleCheck, TriangleAlert } from "lucide-react";
import type { ReadinessLike } from "./pilotage";

/**
 * « Préparer l'ouverture » (spec 091) : synthèse en lecture seule d'une campagne en brouillon
 * (questionnaires, questions, définition, échéances, destinataires, répondants, contrôles,
 * confidentialité). Relue à chaque rafraîchissement de la page.
 */
export default function ReadinessPanel({ readiness }: { readonly readiness: ReadinessLike }) {
  return (
    <section aria-labelledby="readiness-title" className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="readiness-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
          Préparer l&apos;ouverture
        </h2>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          {readiness.ready ? "Tout est prêt : la campagne peut être ouverte." : "Quelques points restent à régler avant l'ouverture."}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-2">
            {item.ok ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.75} />
            ) : (
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" strokeWidth={1.75} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-[22px] text-ink">
                {item.label}
                <span className="sr-only"> : {item.ok ? "satisfait" : "à régler"}</span>
              </p>
              {item.detail && <p className="break-words text-[13px] leading-[18px] text-ink-muted">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
