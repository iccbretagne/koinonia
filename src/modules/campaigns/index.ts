export { campaignsModule } from "./manifest";

// Niveau questionnaire
export {
  getAssignmentView,
  saveAnswers,
  submitAssignment,
  reviewAssignment,
  listRespondents,
  addRespondent,
  removeRespondent,
  regenerateRespondentLink,
  type AssignmentView,
  type ReviewInput,
  type RespondentInput,
  type RespondentView,
} from "./services/assignments";
export {
  storeCampaignFile,
  readCampaignFile,
  deleteCampaignFile,
  getFileAssignmentId,
  purgeExpiredFiles,
  type CampaignFileView,
} from "./services/files";

// Niveau campagne
export {
  importCampaign,
  parseDefinition,
  findCampaignByKey,
  storedDefinition,
  formDefinitionHash,
  type ImportPreview,
  type ImportInput,
  type ImportActor,
  type ImportAction,
} from "./services/import";
export {
  listMyCampaigns,
  getCampaignOverview,
  updateCampaignSettings,
  changeCampaignStatus,
  listManagers,
  addManager,
  removeManager,
  searchCandidates,
  campaignChecks,
  storedRules,
  storedItems,
  type MyCampaigns,
  type AssignmentOverview,
  type CampaignCheck,
  type CampaignActorRef,
  type CampaignSettingsInput,
  type CampaignStatusAction,
} from "./services/campaigns";
export { exportCampaign, type ExportOptions, type ExportResult } from "./services/exports";
export {
  notifyCampaignOpened,
  notifyRespondentAdded,
  notifyChangesRequested,
  notifyAssignmentSubmitted,
  remindAssignment,
  respondentLink,
  runDueReminders,
  assignmentPath,
} from "./services/notify";
export { runCampaignTasks } from "./services/tasks";
