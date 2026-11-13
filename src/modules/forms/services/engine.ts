import { ApiError } from "@/lib/api-utils";
import { CHOICE_TYPES, matchesCondition, type AnswerValue, type QuestionType } from "../schemas";

/**
 * Moteur de formulaires (spec 079, ADR-0030) : validation d'une réponse à partir des questions
 * du formulaire, affichage conditionnel compris. Seule porte d'entrée des réponses : rien n'est
 * enregistré qui n'ait été validé ici. Réutilisable par d'autres modules via l'index.
 */

export interface EngineChoice {
  id: string;
  label: string;
  capacity: number | null;
}

export interface EngineQuestion {
  id: string;
  position: number;
  type: QuestionType;
  label: string;
  required: boolean;
  config: unknown;
  conditionQuestionId: string | null;
  conditionValue: string | null;
  choices: EngineChoice[];
}

export type { AnswerValue } from "../schemas";

export interface ParsedAnswers {
  /** Valeur validée par question visible et renseignée. */
  values: Map<string, AnswerValue>;
  /** Choix retenus (choix unique, liste, choix multiple), pour compter les places. */
  choiceIds: string[];
}

const LIMITS = { SHORT_TEXT: 300, LONG_TEXT: 5000 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+0-9 ().-]{6,25}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const byPosition = (a: EngineQuestion, b: EngineQuestion) => a.position - b.position;

function numberBounds(config: unknown): { min?: number; max?: number } {
  if (!config || typeof config !== "object") return {};
  const { min, max } = config as { min?: unknown; max?: unknown };
  return { min: typeof min === "number" ? min : undefined, max: typeof max === "number" ? max : undefined };
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Message d'erreur pour une valeur invalide, ou null. La valeur normalisée est renvoyée à part. */
function validateValue(q: EngineQuestion, raw: unknown): { value?: AnswerValue; error?: string } {
  const choiceIds = new Set(q.choices.map((c) => c.id));
  switch (q.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      if (typeof raw !== "string") return { error: "texte attendu" };
      const value = raw.trim();
      if (value.length > LIMITS[q.type]) return { error: `${LIMITS[q.type]} caractères au plus` };
      return { value };
    }
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      return typeof raw === "string" && choiceIds.has(raw) ? { value: raw } : { error: "choix inconnu" };
    case "MULTIPLE_CHOICE": {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || !choiceIds.has(v))) return { error: "choix inconnu" };
      return { value: [...new Set(raw as string[])] };
    }
    case "YES_NO":
      return typeof raw === "boolean" ? { value: raw } : { error: "oui ou non attendu" };
    case "NUMBER": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n)) return { error: "nombre entier attendu" };
      const { min, max } = numberBounds(q.config);
      if (min !== undefined && n < min) return { error: `${min} au minimum` };
      if (max !== undefined && n > max) return { error: `${max} au maximum` };
      return { value: n };
    }
    case "DATE": {
      if (typeof raw !== "string" || !DAY.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) return { error: "date invalide" };
      return { value: raw };
    }
    case "EMAIL": {
      const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      return value.length <= 254 && EMAIL.test(value) ? { value } : { error: "adresse email invalide" };
    }
    case "PHONE": {
      const value = typeof raw === "string" ? raw.trim() : "";
      return PHONE.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6 ? { value } : { error: "numéro invalide" };
    }
    case "RATING": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? { value: n } : { error: "note de 1 à 5 attendue" };
    }
    case "CONSENT":
      return typeof raw === "boolean" ? { value: raw } : { error: "case à cocher attendue" };
    case "SESSION_LEVEL":
      return { error: "type de question indisponible" };
  }
}

/**
 * Valide une réponse complète : questions visibles seulement (une question masquée est ignorée,
 * ni requise ni enregistrée), obligatoires renseignées, consentement obligatoire coché, valeurs
 * conformes à leur type. Erreur ⇒ `ApiError(400)` qui nomme la question.
 */
export function parseAnswers(questions: EngineQuestion[], raw: Record<string, unknown>): ParsedAnswers {
  const sorted = [...questions].sort(byPosition);
  const values = new Map<string, AnswerValue>();
  // Ordre des positions : la visibilité d'une question ne dépend que des précédentes.
  const visible = new Set<string>();
  for (const q of sorted) {
    const shown =
      !q.conditionQuestionId ||
      (visible.has(q.conditionQuestionId) && matchesCondition(values.get(q.conditionQuestionId), q.conditionValue ?? ""));
    if (!shown) continue;
    visible.add(q.id);

    const input = raw[q.id];
    if (isEmpty(input) || (q.type === "CONSENT" && input === false)) {
      if (q.required) throw new ApiError(400, `« ${q.label} » : réponse obligatoire`);
      if (q.type === "CONSENT" && input === false) values.set(q.id, false);
      continue;
    }
    const { value, error } = validateValue(q, input);
    if (error !== undefined || value === undefined) throw new ApiError(400, `« ${q.label} » : ${error ?? "valeur invalide"}`);
    if (Array.isArray(value) && value.length === 0 && q.required) throw new ApiError(400, `« ${q.label} » : réponse obligatoire`);
    values.set(q.id, value);
  }

  const choiceIds: string[] = [];
  for (const q of sorted) {
    if (!CHOICE_TYPES.includes(q.type)) continue;
    const v = values.get(q.id);
    if (typeof v === "string") choiceIds.push(v);
    else if (Array.isArray(v)) choiceIds.push(...v);
  }
  return { values, choiceIds };
}

/** Texte lisible d'une valeur (récapitulatif, export). */
export function displayValue(q: Pick<EngineQuestion, "type" | "choices">, value: unknown): string {
  if (value === undefined || value === null) return "";
  const label = (id: unknown) => q.choices.find((c) => c.id === id)?.label ?? String(id);
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (CHOICE_TYPES.includes(q.type)) return label(value);
  if (typeof value === "boolean") return q.type === "CONSENT" ? (value ? "Accepté" : "Refusé") : value ? "Oui" : "Non";
  return String(value);
}
