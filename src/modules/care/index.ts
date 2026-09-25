export { careModule } from "./manifest";

export { requireCareQualify, getCareAccess } from "./auth";
export type { CareAccess } from "./auth";

export {
  appointmentSubmitSchema,
  submitAppointmentRequest,
  listAppointmentRequests,
  getAppointmentRequestById,
  getAppointmentSummaryBySourceRequestId,
  listMyRequests,
  applyAppointmentTransition,
  markAppointmentScheduled,
  revertAppointmentToValidated,
  updateAppointmentScheduledFor,
} from "./services/appointments";
export type { AppointmentSubmitInput } from "./services/appointments";

export {
  appointmentPatchSchema,
  REJECT_REASON_CODES,
  REJECT_REASON_LABELS,
} from "./services/appointment-state";
export type { AppointmentPatchBody } from "./services/appointment-state";

export {
  msdpPatchSchema,
  isMsdpTeamMember,
  isIntegrationTeamMember,
  hasFollowupManagementAccess,
  canStartFollowUp,
  listMsdpFollowUps,
  getMsdpFollowUpById,
  getMsdpFollowUpByIntegrationRequestId,
  applyFollowupTransition,
  createFollowUpFromAppointmentOrientation,
  startMsdpFollowUpFromIntegrationRequest,
  listMsdpCounselors,
  runMsdpInactivityNotifications,
} from "./services/followups";
export type { MsdpPatchBody } from "./services/followups";

export {
  resolveAssignee,
  assertExclusiveAssignment,
  isCurrentAssignee,
  listAssignableProfiles,
} from "./services/assignee";
export type { AssigneeSelection, ResolvedAssignee } from "./services/assignee";

export {
  NEUTRAL_REQUEST_LABEL,
  resolveRequestReaderAccess,
  projectRequest,
  projectForScheduling,
} from "./services/projection";
export type { RequestReaderAccess, ProjectedRequest } from "./services/projection";

export { getCareHistory, getItemChurchId, recordCareHistory } from "./services/history";
export type { CareHistoryEntry } from "./services/history";

export { listRelatedItems } from "./services/related";
export type { RelatedItem } from "./services/related";

export { handleIntegrationSubmitted } from "./services/intake";
export type { IntegrationRequestSubmittedPayload } from "./services/intake";

export { DEFAULT_CARE_SETTINGS, getCareSettings, updateCareSettings } from "./services/settings";
export type { CareDelays } from "./services/settings";

export {
  unassignedDueAt,
  unscheduledDueAt,
  isUnassignedDue,
  isUnscheduledDue,
  runCareRelances,
} from "./services/relances";

export { getCareStats } from "./services/stats";
export type { CareStats, AppointmentStats, MsdpStats } from "./services/stats";
