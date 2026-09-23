export { integrationBus } from "./bus";
export type { IntegrationEvents } from "./events";
export {
  requireIntegrationAccess,
  requireIntegrationExportAccess,
  requireIntegrationSettingsAccess,
  isIntegrationMember,
  isMsdpMember,
} from "./auth";
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
export {
  msdpPatchSchema,
  hasMsdpManagementAccess,
  computeMsdpTransitionData,
  buildMsdpCounselorNotifEmail,
  notifyMsdpCounselorAssigned,
  buildMsdpInactivityEmail,
  runMsdpInactivityNotifications,
} from "./services/msdp-service";
export type { MsdpPatchBody } from "./services/msdp-service";

export { integrationModule } from "./manifest";
