import type { AssistantDataParams, AssistantViewer } from "@/core/assistant";
import { dayKey } from "@/lib/paris-days";
import type { KnowledgeEntry } from "../knowledge/types";
import { cosine, disableEmbedder, type Embedder } from "./embedder";
import { viewerEntries } from "./knowledge";
import { lexicalSimilarity, normalize, tokens } from "./text";

/**
 * Moteur de réponse interchangeable (spec 075, ADR-0028). La V1 `LocalEngine` combine un score
 * de sens (modèle embarqué) et un score lexical, **après** filtrage des fiches par module actif
 * et par audience : une fiche réservée n'est jamais classée pour qui n'y a pas droit (seul son
 * refus, sans donnée, peut l'être).
 */

export interface SuggestionRef {
  key: string;
  title: string;
  question: string;
}

export type AssistantAnswer =
  | { kind: "howto"; key: string; title: string; text: string; href?: string; hrefLabel?: string }
  | { kind: "fixed"; key: string; title: string; text: string }
  | {
      kind: "data";
      key: string;
      title: string;
      intro: string;
      dataQuestion: string;
      params: AssistantDataParams;
      href?: string;
      hrefLabel?: string;
    }
  | { kind: "refused"; key: string; title: string; text: string }
  | { kind: "suggestions"; suggestions: SuggestionRef[] }
  | { kind: "unknown"; suggestions: SuggestionRef[] };

export interface EngineInput {
  question: string;
  viewer: AssistantViewer;
  entries: readonly KnowledgeEntry[];
  now?: Date;
}

export interface AnswerEngine {
  answer(input: EngineInput): Promise<AssistantAnswer>;
}

/** Poids du score de sens dans le score hybride. */
export const SEMANTIC_WEIGHT = 0.65;

/**
 * Seuils (à recalibrer avec `npm run assistant:eval` et le vrai modèle). Les similarités du
 * modèle e5 sont resserrées (~0,75 pour des textes sans rapport, ~0,92 pour une paraphrase) :
 * elles sont ramenées sur 0–1 entre `SEMANTIC_FLOOR` et `SEMANTIC_CEIL`.
 */
export const THRESHOLDS = {
  hybrid: { answer: 0.55, suggest: 0.35 },
  lexical: { answer: 0.5, suggest: 0.3 },
} as const;
export const SEMANTIC_FLOOR = 0.78;
export const SEMANTIC_CEIL = 0.93;

const SUGGESTION_COUNT = 3;

interface Scored {
  entry: KnowledgeEntry;
  refusable: boolean;
  score: number;
}

/** Textes indexés d'une fiche : titre, formulations, formulations rattachées. */
export function entryTexts(entry: KnowledgeEntry): string[] {
  return [entry.title, ...entry.questions, ...(entry.aliases ?? [])];
}

const tokenCache = new WeakMap<KnowledgeEntry, string[][]>();
function entryTokens(entry: KnowledgeEntry): string[][] {
  let cached = tokenCache.get(entry);
  if (!cached) {
    cached = entryTexts(entry).map(tokens);
    tokenCache.set(entry, cached);
  }
  return cached;
}

export function lexicalScore(queryTokens: readonly string[], entry: KnowledgeEntry): number {
  return entryTokens(entry).reduce((best, t) => Math.max(best, lexicalSimilarity(queryTokens, t)), 0);
}

export function rescaleSemantic(similarity: number): number {
  return Math.min(1, Math.max(0, (similarity - SEMANTIC_FLOOR) / (SEMANTIC_CEIL - SEMANTIC_FLOOR)));
}

const suggestion = (entry: KnowledgeEntry): SuggestionRef => ({
  key: entry.key,
  title: entry.title,
  question: entry.questions[0] ?? entry.title,
});

function toAnswer(entry: KnowledgeEntry, refusable: boolean, question: string, now: Date): AssistantAnswer {
  if (refusable) return { kind: "refused", key: entry.key, title: entry.title, text: entry.otherwise ?? "" };
  if (entry.kind === "fixed") return { kind: "fixed", key: entry.key, title: entry.title, text: entry.answer };
  if (entry.kind === "data" && entry.dataQuestion) {
    return {
      kind: "data",
      key: entry.key,
      title: entry.title,
      intro: entry.answer,
      dataQuestion: entry.dataQuestion,
      params: extractParams(question, now),
      href: entry.href,
      hrefLabel: entry.hrefLabel,
    };
  }
  return { kind: "howto", key: entry.key, title: entry.title, text: entry.answer, href: entry.href, hrefLabel: entry.hrefLabel };
}

export class LocalEngine implements AnswerEngine {
  constructor(private readonly embedder: Embedder) {}

  /** Score de sens de chaque fiche (meilleur de ses textes), `null` si le modèle manque. */
  private async semanticScores(question: string, candidates: readonly KnowledgeEntry[]): Promise<number[] | null> {
    if (!this.embedder.model) return null;
    try {
      const texts = candidates.map(entryTexts);
      const flat = texts.flat();
      const [[queryVector], vectors] = await Promise.all([
        this.embedder.embed([question], "query"),
        this.embedder.embed(flat, "passage"),
      ]);
      let offset = 0;
      return texts.map((group) => {
        let best = -1;
        for (let i = 0; i < group.length; i++) best = Math.max(best, cosine(queryVector, vectors[offset + i]));
        offset += group.length;
        return rescaleSemantic(best);
      });
    } catch (error) {
      disableEmbedder(error);
      return null;
    }
  }

  async answer({ question, viewer, entries, now = new Date() }: EngineInput): Promise<AssistantAnswer> {
    const { visible, refusable } = viewerEntries(entries, viewer);
    const candidates = [...visible, ...refusable];
    const queryTokens = tokens(question);
    const semantic = await this.semanticScores(question, candidates);
    const thresholds = semantic ? THRESHOLDS.hybrid : THRESHOLDS.lexical;

    const scored: Scored[] = candidates.map((entry, i) => {
      const lexical = lexicalScore(queryTokens, entry);
      const score = semantic ? SEMANTIC_WEIGHT * semantic[i] + (1 - SEMANTIC_WEIGHT) * lexical : lexical;
      return { entry, refusable: i >= visible.length, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const top = scored[0];
    if (top && top.score >= thresholds.answer) return toAnswer(top.entry, top.refusable, question, now);

    const near = scored.filter((s) => !s.refusable && s.entry.kind !== "fixed");
    const suggestions = near
      .filter((s) => s.score >= thresholds.suggest)
      .slice(0, SUGGESTION_COUNT)
      .map((s) => suggestion(s.entry));
    if (suggestions.length > 0) return { kind: "suggestions", suggestions };
    return {
      kind: "unknown",
      suggestions: near
        .filter((s) => s.score > 0)
        .slice(0, 2)
        .map((s) => suggestion(s.entry)),
    };
  }
}

// ─── Paramètres simples ──────────────────────────────────────────────────────

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Jour et mois visés par une question, en heure de Paris : « dimanche » (le prochain, ou
 * aujourd'hui), « demain », « ce mois-ci », « le mois prochain », « octobre »…
 */
export function extractParams(question: string, now = new Date()): AssistantDataParams {
  const words = ` ${normalize(question)} `;
  const today = dayKey(now)!;
  const params: AssistantDataParams = {};

  if (words.includes(" aujourd hui ") || words.includes(" ce soir ")) params.day = today;
  else if (words.includes(" apres demain ")) params.day = addDays(today, 2);
  else if (words.includes(" demain ")) params.day = addDays(today, 1);
  else {
    const weekday = WEEKDAYS.findIndex((w) => words.includes(` ${w} `));
    if (weekday >= 0) {
      const [y, m, d] = today.split("-").map(Number);
      const current = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const prochain = words.includes(` ${WEEKDAYS[weekday]} prochain `) && weekday === current ? 7 : 0;
      params.day = addDays(today, ((weekday - current + 7) % 7) + prochain);
    }
  }

  const thisMonth = today.slice(0, 7);
  if (words.includes(" mois prochain ")) {
    params.month = addDays(`${thisMonth}-01`, 32).slice(0, 7);
  } else if (/ (ce|du|le) mois /.test(words) || words.includes(" ce mois ci ")) {
    params.month = thisMonth;
  } else {
    const month = MONTHS.findIndex((name) => words.includes(` ${name} `));
    if (month >= 0) {
      const currentMonth = Number(thisMonth.slice(5, 7)) - 1;
      // Un mois passé de plus de deux mois désigne celui de l'an prochain.
      const year = Number(thisMonth.slice(0, 4)) + (month < currentMonth - 2 ? 1 : 0);
      params.month = `${year}-${String(month + 1).padStart(2, "0")}`;
    }
  }
  return params;
}
