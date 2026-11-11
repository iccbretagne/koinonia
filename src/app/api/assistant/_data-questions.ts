import { registry } from "@/lib/registry";
import type { DataQuestion } from "./_data/common";
import {
  ACCOUNTING_QUESTIONS,
  ROOMS_QUESTIONS,
  SHUTTLE_QUESTIONS,
  TICKETING_QUESTIONS,
  TREASURY_QUESTIONS,
} from "./_data/finances-autres";
import { PLANNING_QUESTIONS } from "./_data/planning";
import { AUDIO_QUESTIONS, REPORTS_QUESTIONS } from "./_data/audio-reports";

/**
 * Catalogue des questions de données (spec 075, ADR-0028), composé ici — seul endroit qui voit
 * plusieurs modules à la fois. Une question n'est proposée que si le module qui porte son écran
 * est actif. Aucune question n'est fournie par le module `care` (suivi pastoral).
 */
export const DATA_QUESTION_SOURCES: readonly { module: string; questions: readonly DataQuestion[] }[] = [
  { module: "planning", questions: PLANNING_QUESTIONS },
  { module: "planning", questions: REPORTS_QUESTIONS },
  { module: "audio", questions: AUDIO_QUESTIONS },
  { module: "ticketing", questions: TICKETING_QUESTIONS },
  { module: "rooms", questions: ROOMS_QUESTIONS },
  { module: "accounting", questions: ACCOUNTING_QUESTIONS },
  { module: "shuttle", questions: SHUTTLE_QUESTIONS },
  { module: "treasury", questions: TREASURY_QUESTIONS },
];

/** Questions des modules actifs, par clé. */
export function dataCatalog(isActive: (module: string) => boolean = (m) => registry.has(m)): Map<string, DataQuestion> {
  return new Map(
    DATA_QUESTION_SOURCES.filter((s) => isActive(s.module)).flatMap((s) => s.questions.map((q) => [q.key, q] as const))
  );
}
