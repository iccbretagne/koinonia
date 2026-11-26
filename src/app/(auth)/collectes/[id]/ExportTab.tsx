import { Download, FileSpreadsheet } from "lucide-react";
import { Alert, StatusChip, buttonClasses } from "@/components/ui";
import type { CampaignFormData } from "./types";

/**
 * Onglet Export : classeur complet, puis XLSX ou CSV par questionnaire. Les liens visent la route
 * d'export, qui revérifie le droit et journalise chaque téléchargement.
 */
export default function ExportTab({
  campaignId,
  forms,
}: {
  readonly campaignId: string;
  readonly forms: readonly CampaignFormData[];
}) {
  const url = (format: "xlsx" | "csv", form?: string) =>
    `/api/campaigns/${campaignId}/export?format=${format}${form ? `&form=${encodeURIComponent(form)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="Données nominatives possibles.">
        Les exports contiennent toutes les réponses, questionnaires confidentiels compris. Conservez-les en lieu sûr ; chaque
        export est journalisé.
      </Alert>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-text">
            <FileSpreadsheet aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Toute la campagne</h2>
            <p className="text-[13px] leading-[18px] text-ink-muted">
              Classeur Excel : réponses (une ligne par code et destinataire), groupes, états, contrôles, fichiers reçus.
            </p>
          </div>
        </div>
        <a href={url("xlsx")} className={`${buttonClasses("primary")} self-start`}>
          <Download aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Télécharger le classeur (XLSX)
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Par questionnaire</h2>
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {forms.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex flex-wrap items-center gap-2 text-[15px] text-ink">
                {f.title}
                {f.confidential && <StatusChip tone="danger">Confidentiel</StatusChip>}
              </span>
              <span className="flex gap-2">
                <a href={url("csv", f.key)} className={buttonClasses("secondary", "sm")}>
                  CSV
                </a>
                <a href={url("xlsx", f.key)} className={buttonClasses("secondary", "sm")}>
                  XLSX
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
