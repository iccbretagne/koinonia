/**
 * API publique du module serving — candidatures au service (spec 073).
 */
export { servingModule } from "./manifest";
export {
  submitApplication,
  listApplications,
  hasServingAccess,
  getApplication,
  rejectApplication,
  linkMember,
  getApplicationPhoto,
  exportApplicationPdf,
  resolvePublicChurch,
  type ApplicationSummary,
  type ApplicationDetail,
  type AssignmentSummary,
  type ApplicationBucket,
} from "./services/applications";
export { normalizePhoto } from "./services/photo";
export {
  getServingDurations,
  getServingSettings,
  updateServingSettings,
  DEFAULT_OBSERVATION_MONTHS,
  DEFAULT_RETENTION_MONTHS,
  type ServingSettingsView,
} from "./services/settings";
