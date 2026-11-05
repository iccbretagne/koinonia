export { assistantModule } from "./manifest";
export {
  getChurchSetting,
  getInstanceSettings,
  isAssistantEnabled,
  setChurchDisabled,
  setInstanceEnabled,
  type AssistantActor,
} from "./services/settings";
export { incrementStats, readStats, type StatsPeriod } from "./services/stats";
export { BUILTIN_ENTRIES, DEFAULT_SUGGESTIONS, PREDICATES, type KnowledgeEntry, type Predicate } from "./knowledge";
export {
  entriesForScreen,
  inAudience,
  invalidateKnowledge,
  loadKnowledge,
  moduleOf,
  viewerEntries,
  type LoadedKnowledge,
} from "./services/knowledge";
export { getEmbedder, type Embedder } from "./services/embedder";
export { LocalEngine, extractParams, type AnswerEngine, type AssistantAnswer, type SuggestionRef } from "./services/engine";
