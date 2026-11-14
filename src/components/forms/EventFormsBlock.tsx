import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { StatusChip } from "@/components/ui";
import type { EventForm } from "@/modules/forms";

/**
 * Bloc « Formulaires » d'une page d'événement (spec 079, lot 3) : les formulaires publiés
 * rattachés, avec le lien pour répondre et, pour la gestion, le lien vers les résultats.
 */
export default function EventFormsBlock({ forms, manage = false }: { readonly forms: readonly EventForm[]; readonly manage?: boolean }) {
  if (forms.length === 0) return null;
  return (
    <section className="space-y-2 rounded-card border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <ClipboardList className="size-4" aria-hidden="true" /> Formulaires
      </h2>
      <ul className="space-y-2">
        {forms.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {f.open ? (
                <Link href={f.path} className="font-semibold text-brand-text underline">
                  {f.title}
                </Link>
              ) : (
                <span className="font-semibold text-ink">{f.title}</span>
              )}
              <StatusChip tone={f.open ? "success" : "neutral"}>{f.open ? "Ouvert" : "Réponses closes"}</StatusChip>
            </div>
            {manage && (
              <Link href={`/formulaires/${f.id}?onglet=resultats`} className="text-[14px] text-ink-muted underline">
                Résultats
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
