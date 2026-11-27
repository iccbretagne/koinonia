import { paths } from "@/lib/paths";
import {
  isOverdue,
  type AssignmentStatus,
  type ComposeOptions,
  type MessageContext,
  type MessageContribution,
  type MessageKind,
  type MessageTemplates,
} from "@/modules/campaigns/schemas";

/**
 * Logique de présentation du pilotage (spec 091, lot 2) : filtres du Suivi, questions concernées,
 * contexte des messages de la fenêtre « Communication », choix du type de message par statut.
 * Pur : ni réseau ni React, importable par les composants clients et testé à part.
 */

// ── Filtres du Suivi ───────────────────────────────────────────────────────────────────────────

export type IssueKind = "missing" | "to_research" | "estimate" | "file_pending" | "check";

export interface IssueLike {
  code: string;
  label: string;
  kind: IssueKind;
}

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  missing: "Obligatoires manquants",
  file_pending: "Fichiers attendus",
  to_research: "À rechercher",
  estimate: "Estimations",
  check: "Contrôles non respectés",
};

const ISSUE_ORDER: readonly IssueKind[] = ["missing", "file_pending", "to_research", "estimate", "check"];

export const TRACKING_FILTERS = ["to_research", "estimate", "missing", "check", "file_pending", "exploitable"] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];

export const TRACKING_FILTER_LABELS: Record<TrackingFilter, string> = {
  to_research: "À rechercher",
  estimate: "Estimations",
  missing: "Manquants",
  check: "Contrôles",
  file_pending: "Fichiers",
  exploitable: "Exploitables",
};

/** Une contribution répond-elle au filtre (aucun filtre : toutes) ? */
export function matchesTrackingFilter(row: { issues: readonly IssueLike[]; exploitable: boolean }, filter: TrackingFilter | null): boolean {
  if (!filter) return true;
  if (filter === "exploitable") return row.exploitable;
  return row.issues.some((i) => i.kind === filter);
}

/** Questions concernées regroupées par nature, dans un ordre stable, groupes vides omis. */
export function groupIssues(issues: readonly IssueLike[]): { kind: IssueKind; label: string; items: IssueLike[] }[] {
  return ISSUE_ORDER.map((kind) => ({ kind, label: ISSUE_KIND_LABELS[kind], items: issues.filter((i) => i.kind === kind) })).filter(
    (g) => g.items.length > 0
  );
}

// ── Messages ───────────────────────────────────────────────────────────────────────────────────

/** Ce que la fenêtre « Communication » lit de l'aperçu de la campagne. */
export interface OverviewForMessages {
  campaign: { title: string; churchName: string; dueAt: string | null; messageTemplates: MessageTemplates };
  forms: readonly {
    title: string;
    confidential: boolean;
    assignments: readonly { id: string; label: string; status: AssignmentStatus; dueAt: string | null }[];
  }[];
}

/** Adresse d'une contribution dans Koinonia (répondants avec compte). */
export const contributionLink = (appUrl: string, assignmentId: string) => `${appUrl.replace(/\/+$/, "")}${paths.collectes.reponse(assignmentId)}`;

/**
 * Contexte de composition depuis l'état réel. Le lien de chaque contribution est son adresse dans
 * Koinonia ; `linkOverrides` le remplace (lien personnel d'une personne sans compte, message
 * individuel seulement). `composeMessage` n'utilise aucun lien dans un message collectif.
 */
export function buildMessageContext(
  overview: OverviewForMessages,
  appUrl: string,
  now: Date,
  linkOverrides: Readonly<Record<string, string>> = {}
): MessageContext {
  const contributions: MessageContribution[] = overview.forms.flatMap((f) =>
    f.assignments.map((a) => ({
      id: a.id,
      formTitle: f.title,
      confidential: f.confidential,
      label: a.label,
      status: a.status,
      dueAt: a.dueAt,
      link: linkOverrides[a.id] ?? contributionLink(appUrl, a.id),
    }))
  );
  return {
    churchName: overview.campaign.churchName,
    campaignTitle: overview.campaign.title,
    campaignDueAt: overview.campaign.dueAt,
    appUrl: appUrl.replace(/\/+$/, ""),
    now,
    contributions,
  };
}

/** Relance individuelle d'une ligne du Suivi : correction demandée, en retard, sinon rappel simple. */
export function messageKindForStatus(row: { status: AssignmentStatus; dueAt: string | null }, now: Date): MessageKind {
  if (row.status === "CHANGES_REQUESTED") return "resubmission";
  if (isOverdue(row, now)) return "overdue";
  return "individual";
}

/** Contributions visées par la fenêtre « Communication ». */
export type TargetMode = "auto" | "remaining" | "overdue" | "statuses" | "one";

export const TARGET_MODE_LABELS: Record<TargetMode, string> = {
  auto: "Selon le type de message",
  remaining: "Toutes celles restant à transmettre",
  overdue: "En retard seulement",
  statuses: "Par statut",
  one: "Une contribution",
};

const NOT_DONE: readonly AssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

export interface CommunicationSettings {
  kind: MessageKind;
  mode: TargetMode;
  statuses: readonly AssignmentStatus[];
  contributionId: string | null;
  detail: "short" | "full";
  showDone: boolean;
  showRemaining: boolean;
  includeConfidential: boolean;
}

/** Options de `composeMessage` pour les réglages de la fenêtre et le modèle de la campagne. */
export function composeOptions(settings: CommunicationSettings, templates: MessageTemplates): ComposeOptions {
  const base: ComposeOptions = {
    detail: settings.detail,
    showDone: settings.showDone,
    showRemaining: settings.showRemaining,
    includeConfidential: settings.includeConfidential,
    template: templates[settings.kind] ?? null,
  };
  switch (settings.mode) {
    case "remaining":
      return { ...base, statuses: NOT_DONE, overdueOnly: false };
    case "overdue":
      return { ...base, statuses: NOT_DONE, overdueOnly: true };
    case "statuses":
      return { ...base, statuses: settings.statuses, overdueOnly: false };
    case "one":
      return settings.contributionId ? { ...base, contributionIds: [settings.contributionId] } : { ...base, statuses: [] };
    default:
      return base;
  }
}

/** Réglages initiaux : collectif (aucune cible) ou relance pré-ciblée d'une ligne du Suivi. */
export function initialSettings(preset?: { kind: MessageKind; contributionId?: string | null }): CommunicationSettings {
  return {
    kind: preset?.kind ?? "progress",
    mode: preset?.contributionId ? "one" : "auto",
    statuses: NOT_DONE,
    contributionId: preset?.contributionId ?? null,
    detail: "short",
    showDone: false,
    showRemaining: true,
    includeConfidential: false,
  };
}

/**
 * Changement de type : la clôture remercie les services ayant répondu (liste affichée, restants
 * masqués) ; les autres types reprennent l'affichage par défaut des listes.
 */
export function withKind(settings: CommunicationSettings, kind: MessageKind): CommunicationSettings {
  if (kind === "closing") return { ...settings, kind, showDone: true, showRemaining: false };
  if (settings.kind === "closing") return { ...settings, kind, showDone: false, showRemaining: true };
  return { ...settings, kind };
}

// ── Modèles de messages (Paramètres) ───────────────────────────────────────────────────────────

/**
 * Corps de `messageTemplates` : seuls les textes différents du texte par défaut sont gardés
 * (l'objet remplace l'ensemble) ; aucun texte personnalisé ⇒ `null` (textes par défaut).
 */
export function templatesPayload(
  values: Readonly<Record<MessageKind, string>>,
  defaults: Readonly<Record<MessageKind, string>>
): MessageTemplates | null {
  const out: MessageTemplates = {};
  for (const kind of Object.keys(defaults) as MessageKind[]) {
    const text = values[kind]?.trim() ?? "";
    if (text && text !== defaults[kind].trim()) out[kind] = text;
  }
  return Object.keys(out).length ? out : null;
}

// ── Préparer l'ouverture ───────────────────────────────────────────────────────────────────────

export interface ReadinessLike {
  ready: boolean;
  items: readonly { key: string; label: string; ok: boolean; detail?: string }[];
}

/** Points non satisfaits, en une ligne chacun (rappel de la confirmation d'ouverture). */
export function readinessFailures(readiness: ReadinessLike | null): string[] {
  if (!readiness) return [];
  return readiness.items.filter((i) => !i.ok).map((i) => (i.detail ? `${i.label} : ${i.detail}` : i.label));
}
