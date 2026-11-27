import { parisDateTime } from "@/lib/paris-time";
import type { AssignmentStatus } from "../schemas";

/**
 * Messages de communication d'une campagne (spec 091, EVOL-01 et EVOL-04) : modèles par défaut,
 * variables et composition à partir de l'état réel de la campagne. **Pur** (ni base ni serveur) :
 * réexporté par `@/modules/campaigns/schemas` pour la fenêtre « Communication ».
 *
 * Générer un message n'envoie rien. Format compatible WhatsApp : `*gras*`, `_italique_`, sauts de
 * ligne, liens en clair, aucun HTML. Les messages **collectifs** (`launch`, `progress`,
 * `collective`, `closing`) ne
 * portent jamais de lien personnel ni de lien de contribution : seulement `${appUrl}/collectes`.
 *
 * Ce fichier n'importe que des types depuis `../schemas` (qui le réexporte) : aucune valeur n'y
 * est lue au chargement.
 */

export const MESSAGE_KINDS = ["launch", "initial", "progress", "collective", "individual", "overdue", "resubmission", "closing"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  launch: "Annonce de lancement (à tous)",
  initial: "Demande initiale (une par destinataire)",
  progress: "Point d'avancement",
  collective: "Relance collective",
  individual: "Relance individuelle",
  overdue: "Rappel d'échéance dépassée",
  resubmission: "Demande de nouvelle soumission",
  closing: "Clôture et remerciements (à tous)",
};

/** Messages adressés à tous (aucun lien de contribution) ; les autres sont un par contribution. */
export const COLLECTIVE_MESSAGE_KINDS: readonly MessageKind[] = ["launch", "progress", "collective", "closing"];
export const isCollectiveKind = (kind: MessageKind) => COLLECTIVE_MESSAGE_KINDS.includes(kind);

/** Longueur maximale d'un modèle (validation du format v1 et des paramètres). */
export const MESSAGE_TEMPLATE_MAX_LENGTH = 5000;

/** Modèles personnalisés d'une campagne (`Campaign.messageTemplates`) : clé absente = texte par défaut. */
export type MessageTemplates = Partial<Record<MessageKind, string>>;

export interface MessagePlaceholder {
  key: string;
  description: string;
  /** Types de messages où la variable a une valeur (ailleurs, elle est laissée vide). */
  kinds: readonly MessageKind[];
}

const ALL = MESSAGE_KINDS;
const INDIVIDUAL: readonly MessageKind[] = ["initial", "individual", "overdue", "resubmission"];
const COLLECTIVE = COLLECTIVE_MESSAGE_KINDS;

/** Variables utilisables dans un modèle, sous la forme `{{nom}}`. */
export const MESSAGE_PLACEHOLDERS: readonly MessagePlaceholder[] = [
  { key: "eglise", description: "Nom de l'église", kinds: ALL },
  { key: "campagne", description: "Titre de la campagne", kinds: ALL },
  { key: "date", description: "Date du message (date du point)", kinds: ALL },
  { key: "echeance", description: "Échéance applicable : celle de la contribution, à défaut celle de la campagne (collectif : celle de la campagne)", kinds: ALL },
  { key: "lien", description: "Lien direct de la contribution (lien personnel pour une personne sans compte) ; message collectif : lien vers les questionnaires", kinds: ALL },
  { key: "destinataire", description: "Destinataire de la contribution (service, pôle…)", kinds: INDIVIDUAL },
  { key: "questionnaire", description: "Titre du questionnaire de la contribution", kinds: INDIVIDUAL },
  { key: "statut", description: "Statut actuel de la contribution", kinds: INDIVIDUAL },
  { key: "total", description: "Nombre de contributions comptées", kinds: COLLECTIVE },
  { key: "transmises", description: "Contributions soumises ou validées", kinds: COLLECTIVE },
  { key: "restantes", description: "Contributions restant à transmettre", kinds: COLLECTIVE },
  { key: "retards", description: "Contributions non transmises dont l'échéance est dépassée", kinds: COLLECTIVE },
  { key: "taux", description: "Taux de transmission, calculé par contribution (ex. « 40 % »)", kinds: COLLECTIVE },
  { key: "avancement", description: "Ligne de synthèse : transmises / total et taux", kinds: COLLECTIVE },
  { key: "statuts", description: "Compteurs par statut (niveau de détail « complet » seulement)", kinds: COLLECTIVE },
  { key: "repondu", description: "Liste des contributions transmises (si « services ayant répondu » est coché)", kinds: COLLECTIVE },
  { key: "a_repondre", description: "Liste des contributions restant à transmettre (si « services restant à répondre » est coché)", kinds: COLLECTIVE },
  { key: "sollicites", description: "Liste de toutes les contributions comptées : questionnaires et destinataires sollicités", kinds: COLLECTIVE },
  { key: "perimetre", description: "Ligne de périmètre quand des contributions confidentielles ne sont pas comptées", kinds: COLLECTIVE },
];

const SIGNATURE = "Sois béni(e) !\nLa Coordination générale";

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageKind, string> = {
  launch:
    "Bonjour à tous,\n\nLe *{{campagne}}* de {{eglise}} est lancé ! Nous sollicitons la contribution de chaque service pour faire le bilan.\n\n{{sollicites}}\n\n{{perimetre}}\n\nChaque responsable reçoit le lien de son questionnaire ; il est aussi accessible depuis Koinonia.\nMerci de le compléter au plus tard le *{{echeance}}*.\n👉 {{lien}}\n\nMerci d'avance pour votre disponibilité et votre contribution.\n\nSoyez béni(e)s !\nLa Coordination générale",
  initial:
    "Bonjour,\n\nDans le cadre du {{campagne}} de {{eglise}}, nous sollicitons ta contribution pour {{destinataire}}.\n\nMerci de compléter le questionnaire au plus tard le {{echeance}}.\n\n👉 Accéder au questionnaire :\n{{lien}}\n\nMerci pour ta disponibilité et ta contribution.\n\n" +
    SIGNATURE,
  individual:
    "Bonjour,\n\nPetit rappel concernant le {{campagne}} de {{eglise}} : la contribution pour {{destinataire}} n'est pas encore transmise.\n\nMerci de compléter le questionnaire au plus tard le *{{echeance}}*.\n\n👉 Accéder au questionnaire :\n{{lien}}\n\nMerci pour ta disponibilité et ta contribution.\n\n" +
    SIGNATURE,
  overdue:
    "Bonjour,\n\nL'échéance du {{echeance}} est dépassée pour la contribution de {{destinataire}} au {{campagne}} de {{eglise}}, et nous ne l'avons pas encore reçue.\n\nMerci de compléter le questionnaire *dès que possible* : chaque réponse compte pour le bilan.\n\n👉 Accéder au questionnaire :\n{{lien}}\n\nMerci pour ta compréhension et ta contribution.\n\n" +
    SIGNATURE,
  resubmission:
    "Bonjour,\n\nLa contribution pour {{destinataire}} au {{campagne}} de {{eglise}} a été rouverte : les réponses et fichiers déjà saisis sont conservés.\n\nMerci de vérifier le questionnaire, de le compléter si besoin, puis de le *soumettre à nouveau* au plus tard le {{echeance}}.\n\n👉 Accéder au questionnaire :\n{{lien}}\n\nMerci pour ta disponibilité.\n\n" +
    SIGNATURE,
  progress:
    "*Point d'avancement — {{campagne}}*\n_{{eglise}}, au {{date}}_\n\n{{avancement}}\n{{statuts}}\n\n{{repondu}}\n\n{{a_repondre}}\n\n{{perimetre}}\n\nÉchéance : *{{echeance}}*.\n👉 Les questionnaires : {{lien}}\n\nMerci à tous pour votre mobilisation !\nLa Coordination générale",
  collective:
    "Bonjour à tous,\n\nPour le {{campagne}} de {{eglise}}, *{{restantes}} contribution(s)* restent à transmettre ({{avancement}}).\n\n{{a_repondre}}\n\n{{perimetre}}\n\nMerci de compléter vos questionnaires au plus tard le *{{echeance}}*.\n👉 {{lien}}\n\nMerci pour votre disponibilité et votre contribution.\n\nSoyez béni(e)s !\nLa Coordination générale",
  closing:
    "Bonjour à tous,\n\nLe *{{campagne}}* de {{eglise}} est désormais clôturé.\n\n{{avancement}}\n\n{{repondu}}\n\n{{perimetre}}\n\nUn grand merci à chacun pour le temps consacré et la qualité des informations transmises : votre contribution est précieuse pour le bilan.\n\nSoyez béni(e)s !\nLa Coordination générale",
};

/**
 * Remplace les `{{variables}}` d'un modèle. Variable inconnue ou sans valeur : laissée vide. Le
 * texte reste du texte brut (aucun HTML). Les lignes vides en trop laissées par des variables
 * vides sont resserrées.
 */
export function renderTemplate(template: string, vars: Readonly<Record<string, string | number | null | undefined>>): string {
  const filled = template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined;
    return value === null || value === undefined ? "" : String(value);
  });
  return filled
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Composition ────────────────────────────────────────────────────────────────────────────────

/** Une contribution = un destinataire d'un questionnaire. */
export interface MessageContribution {
  id: string;
  formTitle: string;
  confidential: boolean;
  label: string;
  status: AssignmentStatus;
  /** Échéance applicable (contribution, à défaut campagne) : `Date`, ISO ou jour `AAAA-MM-JJ`. */
  dueAt: Date | string | null;
  /**
   * Lien direct (messages individuels seulement) : adresse de la contribution pour un compte, lien
   * personnel actif pour une personne sans compte. Jamais utilisé dans un message collectif.
   */
  link?: string | null;
}

export interface MessageContext {
  churchName: string;
  campaignTitle: string;
  /** Échéance de la campagne (messages collectifs). */
  campaignDueAt?: Date | string | null;
  /** Origine de l'application, sans `/` final (ex. `https://koinonia.exemple.org`). */
  appUrl: string;
  now: Date;
  contributions: readonly MessageContribution[];
}

export interface ComposeOptions {
  /** Statuts ciblés ; défaut selon le type de message. */
  statuses?: readonly AssignmentStatus[];
  /** Seulement les contributions non transmises dont l'échéance est dépassée (défaut : `overdue`). */
  overdueOnly?: boolean;
  /** Contributions précises (prioritaire sur `statuses`/`overdueOnly`, confidentielles comprises). */
  contributionIds?: readonly string[];
  detail?: "short" | "full";
  /** Lister les contributions transmises (collectif ; défaut : non). */
  showDone?: boolean;
  /** Lister les contributions restant à transmettre (collectif ; défaut : oui). */
  showRemaining?: boolean;
  /** Compter et lister les contributions confidentielles (défaut : non). */
  includeConfidential?: boolean;
  /** Modèle à utiliser (personnalisé de la campagne) ; défaut : `DEFAULT_MESSAGE_TEMPLATES[kind]`. */
  template?: string | null;
}

export interface ProgressCounts {
  total: number;
  done: number;
  remaining: number;
  overdue: number;
  /** Taux de transmission par contribution, entre 0 et 1. */
  rate: number;
  byStatus: Record<AssignmentStatus, number>;
}

export interface ComposedMessage {
  text: string;
  /** Contribution visée (message individuel), null pour un message collectif. */
  contribution: MessageContribution | null;
}

export interface ComposeResult {
  kind: MessageKind;
  collective: boolean;
  /** Collectif : un seul message ; individuel : un message par contribution ciblée. */
  messages: ComposedMessage[];
  /** Compteurs sur le périmètre compté (confidentielles exclues sauf `includeConfidential`). */
  counts: ProgressCounts;
  /** Contributions confidentielles laissées hors des listes et des totaux. */
  excludedConfidential: number;
  /** Contributions ciblées (listes d'un collectif, destinataires d'un individuel). */
  targets: MessageContribution[];
}

const STATUS_ORDER: readonly AssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "VALIDATED"];
const STATUS_LABELS: Record<AssignmentStatus, string> = {
  NOT_STARTED: "Non commencé",
  IN_PROGRESS: "En cours",
  SUBMITTED: "Soumis",
  CHANGES_REQUESTED: "Correction demandée",
  VALIDATED: "Validé",
};
const DONE: readonly AssignmentStatus[] = ["SUBMITTED", "VALIDATED"];
const NOT_DONE: readonly AssignmentStatus[] = ["NOT_STARTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

const DEFAULT_STATUSES: Record<MessageKind, readonly AssignmentStatus[] | null> = {
  launch: null,
  initial: null,
  progress: null,
  closing: null,
  collective: NOT_DONE,
  individual: NOT_DONE,
  overdue: NOT_DONE,
  resubmission: ["IN_PROGRESS", "CHANGES_REQUESTED"],
};

export const isDone = (status: AssignmentStatus) => DONE.includes(status);

/** Date d'une échéance : un jour seul est lu comme ce jour à Paris (midi, sans ambiguïté). */
function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fin d'échéance : un jour seul vaut la fin de cette journée à Paris (règle de l'import). */
function dueInstant(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parisDateTime(value, "23:59").getTime();
  return toDate(value)?.getTime() ?? null;
}

/** « jeudi 4 décembre 2026 », à Paris. */
export function formatMessageDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
}

const shortDate = (value: Date | string | null | undefined) => {
  const d = toDate(value);
  return d ? d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : "";
};

export const isOverdue = (c: Pick<MessageContribution, "status" | "dueAt">, now: Date) => {
  const due = dueInstant(c.dueAt);
  return !isDone(c.status) && due !== null && due < now.getTime();
};

export function progressCounts(contributions: readonly Pick<MessageContribution, "status" | "dueAt">[], now: Date): ProgressCounts {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<AssignmentStatus, number>;
  for (const c of contributions) byStatus[c.status]++;
  const total = contributions.length;
  const done = contributions.filter((c) => isDone(c.status)).length;
  return {
    total,
    done,
    remaining: total - done,
    overdue: contributions.filter((c) => isOverdue(c, now)).length,
    rate: total ? done / total : 0,
    byStatus,
  };
}

const percent = (rate: number) => `${Math.round(rate * 100)} %`;

function listLine(c: MessageContribution, detail: "short" | "full"): string {
  if (detail === "short") return `• ${c.label}`;
  const name = c.label === c.formTitle ? c.label : `${c.formTitle} › ${c.label}`;
  const due = shortDate(c.dueAt);
  return `• ${name} — ${STATUS_LABELS[c.status]}${due ? `, échéance ${due}` : ""}`;
}

function block(title: string, list: readonly MessageContribution[], detail: "short" | "full"): string {
  return list.length ? `*${title}*\n${list.map((c) => listLine(c, detail)).join("\n")}` : "";
}

/**
 * Compose un message depuis l'état réel. Sans `includeConfidential`, les contributions
 * confidentielles sont retirées des listes **et** des totaux, et une ligne de périmètre est
 * ajoutée. Le taux est calculé par contribution. Les messages collectifs n'utilisent aucun `link`.
 */
export function composeMessage(kind: MessageKind, ctx: MessageContext, options: ComposeOptions = {}): ComposeResult {
  const collective = isCollectiveKind(kind);
  const detail = options.detail ?? "short";
  const precise = options.contributionIds?.length ? new Set(options.contributionIds) : null;

  const counted = options.includeConfidential ? ctx.contributions : ctx.contributions.filter((c) => !c.confidential);
  const excludedConfidential = ctx.contributions.length - counted.length;
  const counts = progressCounts(counted, ctx.now);

  const statuses = options.statuses ?? DEFAULT_STATUSES[kind];
  const overdueOnly = options.overdueOnly ?? kind === "overdue";
  const targets = precise
    ? ctx.contributions.filter((c) => precise.has(c.id) && (!collective || counted.includes(c)))
    : counted.filter((c) => (!statuses || statuses.includes(c.status)) && (!overdueOnly || isOverdue(c, ctx.now)));

  const genericLink = `${ctx.appUrl.replace(/\/+$/, "")}/collectes`;
  const common = {
    eglise: ctx.churchName,
    campagne: ctx.campaignTitle,
    date: formatMessageDate(ctx.now),
  };
  const template = options.template?.trim() ? options.template : DEFAULT_MESSAGE_TEMPLATES[kind];

  if (collective) {
    const perimetre = excludedConfidential
      ? `_${excludedConfidential} contribution(s) confidentielle(s) non comptée(s)._`
      : "";
    const done = targets.filter((c) => isDone(c.status));
    const remaining = targets.filter((c) => !isDone(c.status));
    const vars = {
      ...common,
      echeance: formatMessageDate(ctx.campaignDueAt),
      lien: genericLink,
      total: counts.total,
      transmises: counts.done,
      restantes: counts.remaining,
      retards: counts.overdue,
      taux: percent(counts.rate),
      avancement: `*${counts.done}/${counts.total}* contributions transmises (*${percent(counts.rate)}*)`,
      statuts:
        detail === "full"
          ? STATUS_ORDER.filter((s) => counts.byStatus[s] > 0)
              .map((s) => `• ${STATUS_LABELS[s]} : ${counts.byStatus[s]}`)
              .join("\n")
          : "",
      repondu: options.showDone ? block("Ont répondu :", done, detail) : "",
      a_repondre: options.showRemaining ?? true ? block("Restent à répondre :", remaining, detail) : "",
      sollicites: block("Questionnaires et destinataires sollicités :", targets, detail),
      perimetre,
    };
    let text = renderTemplate(template, vars);
    // Le périmètre est toujours dit, même si le modèle personnalisé l'a oublié.
    if (perimetre && !/\{\{\s*perimetre\s*\}\}/.test(template)) text = `${text}\n\n${perimetre}`;
    return { kind, collective, messages: [{ text, contribution: null }], counts, excludedConfidential, targets };
  }

  const messages = targets.map((c) => ({
    contribution: c,
    text: renderTemplate(template, {
      ...common,
      echeance: formatMessageDate(c.dueAt ?? ctx.campaignDueAt),
      lien: c.link || genericLink,
      destinataire: c.label,
      questionnaire: c.formTitle,
      statut: STATUS_LABELS[c.status],
    }),
  }));
  return { kind, collective, messages, counts, excludedConfidential, targets };
}
