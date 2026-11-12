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

/** Texte d'une ligne : espaces de bord retirés, espaces multiples réduits. */
export const cleanText = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

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
