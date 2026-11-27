/**
 * API publique du module serving — candidatures au service (spec 077).
 */
export { servingModule } from "./manifest";
export {
  submitApplication,
  listApplications,
  hasServingAccess,
  countServingQueue,
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
  DEFAULT_SCHEDULING_REMINDER_DAYS,
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

// Entretiens (spec 082)
export {
  expandSeries,
  createSlots,
  updateSlot,
  deleteSlot,
  listSlots,
  listFreeSlots,
  planSlots,
  listInterviewers,
  slotChurchId,
  type SlotView,
  type FreeSlot,
  type SlotUpdate,
} from "./services/slots";
export {
  bookSlot,
  cancelInterview,
  declineSlots,
  recordOutcome,
  inviteToBook,
  resendInterviewLink,
  listInterviews,
  publicInterviewView,
  countToComplete,
  type PublicInterviewView,
  displayStatus,
  candidateCanChange,
  hasRepeatedNoShow,
  type InterviewDisplayStatus,
} from "./services/interviews";
export { findApplicationIdByToken, ensureManageToken } from "./services/tokens";
export { interviewLink } from "./services/notifications";
