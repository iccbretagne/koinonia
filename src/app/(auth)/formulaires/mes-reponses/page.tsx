import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { STATUS_LABEL, listMemberResponses } from "@/modules/forms";

/** Mes réponses ouvertes à des formulaires (spec 079), pour les modifier ou les annuler. */
export default async function MyResponsesPage() {
  const session = await requireAuth();
  const responses = await listMemberResponses(session.user.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Formulaires" title="Mes réponses" description="Vos réponses aux formulaires encore ouverts. Les sondages anonymes n'y figurent pas : rien ne les relie à votre compte." />
      {responses.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Aucune réponse en cours" />
      ) : (
        <ul className="space-y-3">
          {responses.map((r) => (
            <li key={r.id}>
              <Link href={`/f/${r.form.church.slug}/${r.form.slug}`} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:border-brand">
                <span>
                  <span className="block font-semibold text-ink">{r.form.title}</span>
                  <span className="text-[13px] text-ink-muted">{r.form.church.name}</span>
                </span>
                <StatusChip tone={r.status === "CONFIRMED" ? "success" : "info"}>{STATUS_LABEL[r.status]}</StatusChip>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
