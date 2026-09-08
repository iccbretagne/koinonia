export { integrationBus } from "./bus";
export type { IntegrationEvents } from "./events";
export {
  requireIntegrationAccess,
  requireIntegrationExportAccess,
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
  runInactivityNotifications,
} from "./services/family-service";
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
