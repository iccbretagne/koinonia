export { integrationBus } from "./bus";
export type { IntegrationEvents } from "./events";
export {
  requireIntegrationAccess,
  requireIntegrationExportAccess,
  requireIntegrationFullAccess,
  requireIntegrationSettingsAccess,
  isIntegrationMember,
  isMsdpMember,
  requireIntegrationDelete,
  canDeleteIntegrationRequest,
} from "./auth";
export { deleteIntegrationRequest } from "./services/deletion";
export type { IntegrationScope } from "./auth";
export {
  EXPORT_COLUMNS,
  buildIntegrationExportRows,
} from "./services/export-service";
export type { IntegrationExportInput } from "./services/export-service";
export {
  buildConfirmationEmail,
  buildBergerNotifEmail,
  buildInactivityEmail,
  notifyBergerAssigned,
  notifyBergerUnassigned,
  notifyIntegrationTeamHandback,
  notifyIntegrationTeamNewRequest,
  runInactivityNotifications,
  DEFAULT_INTEGRATION_SETTINGS,
  getIntegrationSettings,
  updateIntegrationSettings,
  relanceDueAt,
  isRelanceDue,
  relanceTargetLabel,
  buildRelanceEmail,
  runWaitingRelanceNotifications,
} from "./services/family-service";
export type { IntegrationDelays } from "./services/family-service";
export {
  familyPatchSchema,
  ABANDON_REASON_CODES,
  ABANDON_REASON_LABELS,
  WAITING_STATUSES,
  isWaitingStatus,
  computeFamilyTransitionData,
  computeReopenData,
  statusBeforeAbandon,
  assertNoStaleAssignment,
  contactConsentSchema,
  initialRequestStatusData,
} from "./services/family-state";
export type { FamilyPatchBody, FamilyRequestState, FamilyActor } from "./services/family-state";
export { recordStatusChange, getRequestHistory, getRequestAccessInfo } from "./services/family-history";
export type { RequestHistoryEntry } from "./services/family-history";

export { integrationModule } from "./manifest";
