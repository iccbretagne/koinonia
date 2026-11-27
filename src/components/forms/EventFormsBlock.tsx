import Link from "next/link";
import { ChartColumn, ClipboardList } from "lucide-react";
import { StatusChip, buttonClasses } from "@/components/ui";
import type { EventForm } from "@/modules/forms";

/**
 * Bloc « Formulaires » d'une page d'événement (spec 079, lot 3) : les formulaires publiés
 * rattachés, avec le lien pour répondre et, pour la gestion, le lien vers les résultats.
 */
export default function EventFormsBlock({ forms, manage = false }: { readonly forms: readonly EventForm[]; readonly manage?: boolean }) {
  if (forms.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold leading-6 text-ink">
        <ClipboardList className="size-5 text-ink-subtle" aria-hidden="true" strokeWidth={1.75} /> Formulaires
      </h2>
      <ul className="flex flex-col gap-2">
        {forms.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{f.title}</span>
              <StatusChip tone={f.open ? "success" : "neutral"}>{f.open ? "Ouvert" : "Réponses closes"}</StatusChip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {manage && (
                <Link href={`/formulaires/${f.id}?onglet=resultats`} className={`${buttonClasses("ghost", "sm")} min-h-11 sm:min-h-9`}>
                  <ChartColumn aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Voir les résultats
                </Link>
              )}
              {f.open && (
                <Link href={f.path} className={`${buttonClasses("secondary", "sm")} min-h-11 sm:min-h-9`} aria-label={`Répondre au formulaire ${f.title}`}>
                  Répondre
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
