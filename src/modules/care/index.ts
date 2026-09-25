export { careModule } from "./manifest";

export { requireCareQualify, getCareAccess } from "./auth";
export type { CareAccess } from "./auth";

export {
  appointmentSubmitSchema,
  appointmentPatchSchema,
  submitAppointmentRequest,
  listAppointmentRequests,
  getAppointmentRequestById,
  getAppointmentSummaryBySourceRequestId,
  validateAppointmentRequest,
  rejectAppointmentRequest,
  markAppointmentScheduled,
  revertAppointmentToValidated,
  updateAppointmentScheduledFor,
} from "./services/appointments";
export type { AppointmentSubmitInput, AppointmentPatchBody } from "./services/appointments";

export {
  msdpPatchSchema,
  isMsdpTeamMember,
  isIntegrationTeamMember,
  hasFollowupManagementAccess,
  canStartFollowUp,
  computeMsdpTransitionData,
  listMsdpFollowUps,
  getMsdpFollowUpById,
  getMsdpFollowUpByIntegrationRequestId,
  applyMsdpTransition,
  startMsdpFollowUpFromIntegrationRequest,
  listMsdpCounselors,
  runMsdpInactivityNotifications,
} from "./services/followups";
export type { MsdpPatchBody } from "./services/followups";

export {
  NEUTRAL_REQUEST_LABEL,
  resolveRequestReaderAccess,
  projectRequest,
  projectForScheduling,
} from "./services/projection";
export type { RequestReaderAccess, ProjectedRequest } from "./services/projection";

export { handleIntegrationSubmitted } from "./services/intake";
export type { IntegrationRequestSubmittedPayload } from "./services/intake";
