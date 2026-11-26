import { ShieldCheck } from "lucide-react";
import { Alert, EmptyState, StatusChip, type StatusTone } from "@/components/ui";
import type { CampaignFormData, CampaignOverviewData } from "./types";

type Check = CampaignOverviewData["checks"][number];

const RESULT: Record<Check["result"], { label: string; tone: StatusTone; order: number }> = {
  violated: { label: "Non respecté", tone: "warning", order: 0 },
  skipped: { label: "Non évaluable", tone: "neutral", order: 1 },
  ok: { label: "Respecté", tone: "success", order: 2 },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return value.toLocaleString("fr-FR");
  return String(value);
}

/** Onglet Contrôles : règles de cohérence, indicatives et jamais bloquantes. */
export default function ChecksTab({
  checks,
  forms,
  codeForms,
}: {
  readonly checks: readonly Check[];
  readonly forms: readonly CampaignFormData[];
  readonly codeForms: Record<string, string>;
}) {
  const formTitle = new Map(forms.map((f) => [f.key, f.title]));
  const sorted = [...checks].sort((a, b) => RESULT[a.result].order - RESULT[b.result].order);
  const violated = checks.filter((c) => c.result === "violated").length;

  if (checks.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState icon={ShieldCheck} title="Aucun contrôle" description="La définition de cette campagne ne déclare aucune règle de cohérence." size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone={violated ? "warning" : "info"} title={violated ? `${violated} contrôle(s) non respecté(s).` : "Tous les contrôles évaluables sont respectés."}>
        Ces contrôles sont indicatifs : ils ne bloquent ni la soumission ni la validation. « Non évaluable » : une valeur manque ou
        n&apos;est pas exploitable (sans objet, NSP).
      </Alert>
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {sorted.map((c, i) => {
          const r = RESULT[c.result];
          const codes = Object.keys(c.values);
          const concerned =
            c.scope === "local"
              ? [`${formTitle.get(c.formKey ?? "") ?? c.formKey} · ${c.assignmentLabel}`]
              : [...new Set(codes.map((code) => codeForms[code]).filter(Boolean))];
          return (
            <li key={`${c.key}-${c.assignmentId ?? "cross"}-${i}`} className="flex flex-col gap-1.5 border-t border-line px-4 py-3 first:border-t-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-[15px] font-semibold leading-[22px] text-ink">{c.message}</p>
                <StatusChip tone={r.tone} className="shrink-0">
                  {r.label}
                </StatusChip>
              </div>
              <p className="text-[13px] leading-[18px] text-ink-muted">
                {c.scope === "cross" ? "Entre questionnaires" : "Dans le questionnaire"}
                {concerned.length > 0 && ` : ${concerned.join(", ")}`}
              </p>
              {codes.length > 0 && (
                <p className="break-words font-mono text-[13px] leading-[18px] text-ink-subtle">
                  {codes.map((code) => `${code} = ${formatValue(c.values[code])}`).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
