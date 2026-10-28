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
export {
  assignApplication,
  acceptAssignment,
  confirmAssignment,
  sendBackAssignment,
  type AttachMember,
  type DetachMember,
} from "./services/assignments";
export { findMemberMatches, listObservationMemberIds, type MemberMatch, type MemberSearch } from "./services/members";
export { getOwnApplication, type OwnApplicationView, type OwnAssignment } from "./services/own";
export { runServingTasks, type ServingTasksResult } from "./services/lifecycle";
