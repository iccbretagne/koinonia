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
