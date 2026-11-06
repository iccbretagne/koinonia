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
export { anonymize } from "./services/text";
export { ask, recordFeedback, getEngine, primaryRole, GUIDE_HREF, type AskResponse, type AskDeps } from "./services/ask";
export {
  answerPending,
  countOpenPending,
  deletePending,
  linkPending,
  listPending,
  markOffTopic,
  recordPending,
} from "./services/pending";
export { createCustomEntry, deleteCustomEntry, listAdminEntries, patchEntry, type AdminEntry } from "./services/entries";
export { runAssistantDigest } from "./services/digest";
export { getPersona, setPersona } from "./services/persona";
