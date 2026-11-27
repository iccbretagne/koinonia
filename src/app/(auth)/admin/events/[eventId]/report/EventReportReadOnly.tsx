import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState, buttonClasses } from "@/components/ui";
import { reportStatFields } from "@/lib/report-stats";
import { paths } from "@/lib/paths";

interface ReadOnlySection {
  id: string;
  label: string;
  stats: unknown;
  notes: string | null;
  department?: { ministry: { name: string } } | null;
}

interface Props {
  readonly statsEnabled: boolean;
  readonly report: {
    speaker: string | null;
    messageTitle: string | null;
    notes: string | null;
    decisions: string | null;
    sections: ReadOnlySection[];
  } | null;
}

function Text({ label, value }: { readonly label: string; readonly value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-ink">{label}</p>
      <p className="whitespace-pre-line text-[15px] leading-[22px] text-ink-muted">{value}</p>
    </div>
  );
}

/**
 * Compte rendu en lecture pastorale (spec 092, exception 3) : aucun champ, aucun bouton
 * d'enregistrement, ni export PDF ni partage — l'écriture reste refusée côté serveur
 * (`PUT /api/events/[eventId]/report`, `reports:edit`/`events:manage`).
 */
export default function EventReportReadOnly({ statsEnabled, report }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {!report ? (
        <EmptyState title="Aucun compte rendu" description="Le compte rendu de cet événement n'a pas encore été saisi." />
      ) : (
        <>
          {(report.speaker || report.messageTitle) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Text label="Orateur" value={report.speaker} />
              <Text label="Titre du message" value={report.messageTitle} />
            </div>
          )}

          {report.sections.map((section) => {
            const fields = statsEnabled ? reportStatFields(section.label) : null;
            const stats = (section.stats ?? {}) as Record<string, number | null>;
            return (
              <section key={section.id} className="rounded-card border border-line bg-surface p-4">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="min-w-0 flex-1 text-base font-semibold text-ink">{section.label}</h2>
                  {section.department && (
                    <span className="text-[13px] leading-[18px] text-ink-muted">{section.department.ministry.name}</span>
                  )}
                </div>
                {fields && (
                  <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {fields.map(({ key, label }) => (
                      <div key={key}>
                        <dt className="text-[13px] leading-[18px] text-ink-muted">{label}</dt>
                        <dd className="font-display text-lg font-semibold text-ink">{stats[key] ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Text label="Observations" value={section.notes} />
              </section>
            );
          })}

          <Text label="Observations générales" value={report.notes} />
          <Text label="Décisions / Actions" value={report.decisions} />
        </>
      )}

      <Link href={paths.admin.reports()} className={`${buttonClasses("ghost")} self-start`}>
        <ArrowLeft className="size-4" aria-hidden="true" strokeWidth={1.75} />
        Revenir aux comptes rendus
      </Link>
    </div>
  );
}
