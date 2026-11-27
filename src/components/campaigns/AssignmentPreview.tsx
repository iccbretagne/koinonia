"use client";

import { useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { FilterChip, Select } from "@/components/ui";
import {
  previewAssignmentView,
  type PreviewAssignmentInput,
  type PreviewCampaignInput,
  type PreviewFormInput,
  type Rule,
} from "@/modules/campaigns/schemas";
import AssignmentForm, { type AssignmentViewData } from "./AssignmentForm";

/**
 * Aperçu répondant d'un questionnaire (spec 091, EVOL-03) : la vraie saisie (`AssignmentForm` en
 * mode aperçu, sans appel réseau) sur une vue vide construite par `previewAssignmentView`, depuis
 * la définition stockée (page d'aperçu) ou en cours d'édition (éditeur). Bascule pleine largeur /
 * téléphone (cadre de 390 px) et choix du destinataire quand il y en a plusieurs.
 */

export type Display = "full" | "phone";

export default function AssignmentPreview({
  campaign,
  form,
  assignments,
  rules,
}: {
  readonly campaign: PreviewCampaignInput;
  readonly form: PreviewFormInput;
  /** Destinataires du questionnaire, dans l'ordre ; le premier est montré par défaut. */
  readonly assignments: readonly PreviewAssignmentInput[];
  readonly rules?: readonly Rule[];
}) {
  const [display, setDisplay] = useState<Display>("full");
  const [index, setIndex] = useState(0);
  const assignment = assignments[Math.min(index, assignments.length - 1)] ?? {};

  // Même forme que la vue serveur après sérialisation (dates en chaînes ISO) ; la vue ne change
  // d'identité que si son contenu change.
  const serialized = JSON.stringify(previewAssignmentView(campaign, form, assignment));
  const view = useMemo(() => JSON.parse(serialized) as AssignmentViewData, [serialized]);
  // La saisie d'essai repart de zéro quand la définition ou le destinataire change.
  const resetKey = `${index}:${hash(serialized)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {assignments.length > 1 ? (
          <div className="w-full sm:w-72">
            <Select
              label="Destinataire"
              value={String(index)}
              options={assignments.map((a, i) => ({
                value: String(i),
                label: a.label ?? `Destinataire ${i + 1}`,
              }))}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
          </div>
        ) : (
          <span />
        )}
        <div role="group" aria-label="Affichage" className="flex flex-wrap gap-2 self-start sm:self-auto">
          <FilterChip pressed={display === "full"} onClick={() => setDisplay("full")}>
            <Monitor aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Pleine largeur
          </FilterChip>
          <FilterChip pressed={display === "phone"} onClick={() => setDisplay("phone")}>
            <Smartphone aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Téléphone
          </FilterChip>
        </div>
      </div>

      <div
        className={
          display === "phone"
            ? "mx-auto w-full max-w-[390px] overflow-hidden rounded-card border border-line bg-bg px-3 py-4 shadow-sm"
            : "w-full"
        }
      >
        <AssignmentForm key={resetKey} view={view} apiBase="" preview previewRules={rules} />
      </div>
    </div>
  );
}

/** Empreinte courte d'un texte (remise à zéro de l'essai quand la définition change). */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
