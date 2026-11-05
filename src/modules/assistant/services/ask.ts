import type { AssistantDataParams, AssistantViewer, DataAnswer, DataResult } from "@/core/assistant";
import { isDataRefusal } from "@/core/assistant";
import { ROLE_KEYS } from "../schemas";
import { getEmbedder } from "./embedder";
import { LocalEngine, type AnswerEngine, type SuggestionRef } from "./engine";
import { loadKnowledge } from "./knowledge";
import { recordPending } from "./pending";
import { incrementStats, type StatField } from "./stats";

/**
 * Orchestration d'une question (spec 075) : moteur → question de données éventuelle →
 * compteurs → question inconnue remontée, anonymisée. Aucune conversation n'est enregistrée :
 * seule la question sans réponse est gardée, sans compte ni église.
 */

export const GUIDE_HREF = "/guide";
export const DATA_UNAVAILABLE =
  "Je n'arrive pas à lire ces informations pour le moment. Ouvrez l'écran pour les voir.";

export type AskResponse = (
  | { kind: "howto"; key: string; title: string; text: string; href?: string; hrefLabel?: string }
  | { kind: "fixed"; key: string; title: string; text: string }
  | { kind: "data"; key: string; title: string; intro: string; data: DataAnswer | null; href?: string; hrefLabel?: string }
  | { kind: "refused"; key: string; title: string; text: string }
  | { kind: "suggestions"; suggestions: SuggestionRef[] }
  | { kind: "unknown"; suggestions: SuggestionRef[]; guideHref: string }
) & {
  /** Nom de l'église courante, quand le compte en a plusieurs. */
  church?: string;
};

export interface AskDeps {
  viewer: AssistantViewer;
  /** Exécute une question de données ; `null` si elle n'est pas disponible. */
  runData: (key: string, params: AssistantDataParams) => Promise<DataResult | null>;
  engine?: AnswerEngine;
  now?: Date;
}

let sharedEngine: AnswerEngine | null = null;
/** Moteur du processus : `ASSISTANT_ENGINE=local` (seul moteur en V1, ADR-0028). */
export function getEngine(): AnswerEngine {
  sharedEngine ??= new LocalEngine(getEmbedder());
  return sharedEngine;
}

/** Rôle principal, pour le contexte d'une question à traiter (jamais le compte). */
export function primaryRole(viewer: AssistantViewer): string | null {
  return ROLE_KEYS.find((r) => viewer.roles.includes(r)) ?? null;
}

export async function ask(input: { question: string; screen?: string }, deps: AskDeps): Promise<AskResponse> {
  const { viewer } = deps;
  const knowledge = await loadKnowledge();
  const engine = deps.engine ?? getEngine();
  const answer = await engine.answer({ question: input.question, viewer, entries: knowledge.entries, now: deps.now });
  const stats: StatField[] = ["questions"];
  let response: AskResponse;

  switch (answer.kind) {
    case "data": {
      let data: DataAnswer | null = null;
      let refused = false;
      try {
        const result = await deps.runData(answer.dataQuestion, answer.params);
        if (result && isDataRefusal(result)) refused = true;
        else data = result;
      } catch {
        data = null;
      }
      if (refused) {
        // Défense en profondeur : le fournisseur refuse ce que l'audience aurait dû écarter.
        const entry = knowledge.entries.find((e) => e.key === answer.key);
        response = { kind: "refused", key: answer.key, title: answer.title, text: entry?.otherwise ?? "Cette information ne vous est pas accessible." };
        stats.push("answered");
      } else {
        response = {
          kind: "data",
          key: answer.key,
          title: answer.title,
          intro: data ? answer.intro : DATA_UNAVAILABLE,
          data,
          href: answer.href,
          hrefLabel: answer.hrefLabel,
        };
        stats.push("answered", "dataAnswers");
      }
      break;
    }
    case "howto":
    case "fixed":
    case "refused":
      response = answer;
      stats.push("answered");
      break;
    case "suggestions":
      response = answer;
      stats.push("suggested");
      break;
    case "unknown":
      response = { ...answer, guideHref: GUIDE_HREF };
      stats.push("unanswered");
      await recordPending({ text: input.question, reason: "UNANSWERED", screen: input.screen, role: primaryRole(viewer) });
      break;
  }

  await incrementStats(stats, deps.now);
  return viewer.churchCount > 1 ? { ...response, church: viewer.churchName } : response;
}

/** Avis « Utile » / « Pas utile » : compteur ; « Pas utile » remonte la question, anonymisée. */
export async function recordFeedback(
  input: { question: string; helpful: boolean; screen?: string },
  viewer: AssistantViewer
) {
  await incrementStats([input.helpful ? "helpful" : "notHelpful"]);
  if (!input.helpful) {
    await recordPending({ text: input.question, reason: "NOT_HELPFUL", screen: input.screen, role: primaryRole(viewer) });
  }
  return { ok: true };
}
