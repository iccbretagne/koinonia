import { parisDateTime } from "@/lib/paris-time";
import type { DefinitionSection } from "../schemas";
import type { AssignmentView } from "./assignments";
import { completeness, flattenItems } from "./definition";

/**
 * Aperçu répondant (spec 091, EVOL-03) : une vue de saisie **vide**, telle que le répondant la
 * verra, construite depuis une définition stockée ou en cours d'édition. Pur (ni base ni serveur) :
 * réexporté par `@/modules/campaigns/schemas` pour l'éditeur graphique. Rien n'est enregistré :
 * l'écran d'aperçu n'appelle aucune route.
 */

type DateInput = Date | string | null | undefined;

export interface PreviewCampaignInput {
  id?: string;
  title: string;
  description?: string | null;
  periodStart?: DateInput;
  periodEnd?: DateInput;
  dueAt?: DateInput;
  status?: string;
}

export interface PreviewFormInput {
  id?: string;
  key: string;
  title: string;
  confidential?: boolean;
  revision?: number;
  intro?: string;
  sections: readonly DefinitionSection[];
}

export interface PreviewAssignmentInput {
  id?: string;
  key?: string;
  label?: string;
  /** Échéance propre du destinataire ; à défaut celle de la campagne. */
  dueAt?: DateInput;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Jour de période (colonne `@db.Date`) : minuit UTC, comme en base. */
function dayDate(value: DateInput): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(DAY.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Échéance : un jour seul vaut la fin de cette journée à Paris (règle de l'import). */
function dueDate(value: DateInput): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = DAY.test(value) ? parisDateTime(value, "23:59") : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Vue d'affectation vide : rôle gestionnaire, saisie permise (`editable: true`), aucune réponse,
 * aucun fichier, aucune alerte, complétude calculée sur aucune réponse.
 */
export function previewAssignmentView(
  campaign: PreviewCampaignInput,
  form: PreviewFormInput,
  assignment: PreviewAssignmentInput | string = {}
): AssignmentView {
  const a = typeof assignment === "string" ? { label: assignment } : assignment;
  const sections = [...form.sections];
  const items = flattenItems(sections);
  return {
    role: "manager",
    editable: true,
    campaign: {
      id: campaign.id ?? "apercu",
      title: campaign.title,
      description: campaign.description ?? null,
      periodStart: dayDate(campaign.periodStart),
      periodEnd: dayDate(campaign.periodEnd),
      dueAt: dueDate(campaign.dueAt),
      status: campaign.status ?? "DRAFT",
    },
    form: {
      id: form.id ?? "apercu",
      key: form.key,
      title: form.title,
      confidential: form.confidential ?? false,
      revision: form.revision ?? 1,
      intro: form.intro,
      sections,
    },
    assignment: {
      id: a.id ?? "apercu",
      key: a.key ?? "apercu",
      label: a.label ?? form.title,
      status: "NOT_STARTED",
      dueAt: dueDate(a.dueAt) ?? dueDate(campaign.dueAt),
      reviewReason: null,
      startedAt: null,
      submittedAt: null,
      submittedByName: null,
      validatedAt: null,
      pastoralValidated: false,
    },
    answers: {},
    files: [],
    alerts: [],
    completeness: completeness(items, new Map()),
  };
}
