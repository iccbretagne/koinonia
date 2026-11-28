import type { ZodType } from "zod";

/**
 * Contrat des questions de données de l'assistant (spec 075, ADR-0028).
 *
 * Chaque module fournit les siennes depuis son index (`assistantDataQuestions`), écrites avec
 * ses propres services et règles de périmètre : une réponse ne montre jamais plus que l'écran
 * correspondant. La composition des modules actifs se fait dans `src/app`
 * (`src/app/api/assistant/_data-questions.ts`) ; le module `assistant` n'importe aucun module.
 *
 * Une question de données est exactement l'« outil » qu'une IA appellerait plus tard : un nom,
 * une description, des paramètres validés, un résultat borné fait de libellés.
 */

/** Ce que l'assistant sait de la personne, pour l'église courante uniquement. */
export interface AssistantViewer {
  userId: string;
  churchId: string;
  churchName: string;
  /** Nombre d'églises du compte : au-delà d'une, la réponse nomme l'église courante. */
  churchCount: number;
  isSuperAdmin: boolean;
  /** Rôles du compte dans l'église courante. */
  roles: readonly string[];
  /** Permissions de ces rôles (`rolePermissions`). */
  permissions: readonly string[];
  /** Prédicats d'accès vrais pour ce compte (« linkedStar », « shuttleTeam »…). */
  predicates: readonly string[];
  /** Modules actifs sur l'instance. */
  modules: readonly string[];
}

/** Paramètres simples extraits de la question (dates relatives en heure de Paris). */
export interface AssistantDataParams {
  /** Jour visé, AAAA-MM-JJ (« dimanche », « demain »). */
  day?: string;
  /** Mois visé, AAAA-MM (« ce mois-ci », « octobre »). */
  month?: string;
  /**
   * Campagne de collecte visée (identifiant ou clé), passée par un assistant IA (MCP) ; absente
   * dans la bulle, où la question retient la campagne la plus récente.
   */
  campaign?: string;
}

/** Nombre maximal de lignes d'une réponse de données ; au-delà, « Voir la suite ». */
export const DATA_ANSWER_MAX_ITEMS = 8;

export interface DataAnswerItem {
  label: string;
  detail?: string;
  href?: string;
}

/** Réponse de données : des libellés seulement, jamais une coordonnée ni une donnée pastorale. */
export interface DataAnswer {
  title: string;
  items: DataAnswerItem[];
  /** Nombre total de lignes (peut dépasser `items.length`). */
  total: number;
  href: string;
  hrefLabel: string;
  /** Phrase affichée quand il n'y a rien à montrer. */
  empty?: string;
}

/** Refus : la personne n'a pas accès à l'écran correspondant. Aucune donnée. */
export interface DataRefusal {
  refused: true;
}

export type DataResult = DataAnswer | DataRefusal;

export interface AssistantDataContext<P, S> {
  session: S;
  churchId: string;
  params: P;
  viewer: AssistantViewer;
}

export interface AssistantDataQuestion<P = AssistantDataParams, S = unknown> {
  /** Clé stable, ex. « planning.myNextService ». */
  key: string;
  /** Ce que la question renvoie, pour une future IA. */
  description: string;
  params: ZodType<P>;
  run(ctx: AssistantDataContext<P, S>): Promise<DataResult>;
}

export function isDataRefusal(result: DataResult): result is DataRefusal {
  return "refused" in result && result.refused === true;
}

/**
 * Caractères de contrôle et de mise en forme invisibles (retours à la ligne, direction du texte,
 * largeur nulle) : un texte saisi par un tiers ne doit jamais pouvoir se faire passer, une fois
 * renvoyé à un assistant IA, pour une nouvelle ligne ou une consigne.
 */
// U+200C/U+200D (liants) gardés : ils composent les emoji et certaines écritures. Les caractères
// « étiquettes » (U+E0000–E007F), invisibles, servent à cacher des consignes : retirés.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B\u200E\u200F\u2028-\u202E\u2060-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu;

/** Coupe à `max` caractères (points de code, jamais au milieu d'un emoji), avec « … ». */
function bound(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : text;
}

/** Texte d'une ligne : caractères invisibles retirés, espaces réduits ; borné seulement si `max` est donné. */
export const cleanText = (text: string | null | undefined, max = Infinity) =>
  bound((text ?? "").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim(), max);

/**
 * Texte libre saisi par une autre personne (nom d'un formulaire public, motif, note…), renvoyé à
 * un assistant IA : une seule ligne, borné, et les guillemets « » neutralisés pour que `quoted`
 * délimite toujours tout le champ. C'est une donnée, jamais une consigne (voir les instructions
 * du serveur MCP).
 */
export const untrustedText = (text: string | null | undefined, max = 500) => cleanText(text, max).replace(/[«»]/g, '"');

/** Nom saisi par un tiers : `untrustedText` borné à 80 caractères. */
export const untrustedName = (text: string | null | undefined) => untrustedText(text, 80);

/** Champ libre d'un tiers, clairement délimité dans un texte : « … ». */
export const quoted = (text: string | null | undefined, max = 500) => `« ${untrustedText(text, max)} »`;

/**
 * Réponse complète d'une question : titre, libellés et détails nettoyés (un détail vide disparaît, pour
 * ne jamais laisser un séparateur seul), total = nombre de lignes. Aucune troncature ici :
 * chaque consommateur borne à sa façon (`pageAnswer`).
 */
export function boundedAnswer(answer: Omit<DataAnswer, "items" | "total"> & { items: DataAnswerItem[] }): DataAnswer {
  const items = answer.items.map(({ label, detail, href }) => {
    const clean = cleanText(detail);
    return { label: cleanText(label), ...(clean ? { detail: clean } : {}), ...(href ? { href } : {}) };
  });
  return { ...answer, title: cleanText(answer.title), items, total: items.length };
}

/** Une page de la réponse (`offset`, `limit`), le total restant celui de la liste complète. */
export function pageAnswer(answer: DataAnswer, page: { offset?: number; limit: number }): DataAnswer {
  const offset = page.offset ?? 0;
  return { ...answer, items: answer.items.slice(offset, offset + page.limit) };
}
