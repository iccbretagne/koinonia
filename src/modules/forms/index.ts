export { formsModule } from "./manifest";

// Moteur (réutilisable par d'autres modules, ADR-0030)
export { parseAnswers, displayValue } from "./services/engine";
export type { EngineQuestion, ParsedAnswers } from "./services/engine";

// Construction et cycle de vie
export {
  createForm,
  getForm,
  updateForm,
  duplicateForm,
  usageCounts,
  assertSafeEdit,
  slugify,
  needsContact,
  contactQuestion,
  CONTACT_QUESTION,
  listForms,
  ensureRegistrationQuestion,
  FORM_INCLUDE,
  ACTIVE_STATUSES,
  HOLDING_STATUSES,
} from "./services/builder";
export type { FormWithQuestions } from "./services/builder";
export { changeStatus, deleteForm, loadAnswerableForm, acceptsResponses, UNAVAILABLE } from "./services/lifecycle";
export type { AnswerableForm } from "./services/lifecycle";

// Réponses
export {
  submitResponse,
  updateOwnResponse,
  cancelResponse,
  findResponseByToken,
  findMemberResponse,
  manageTokenOf,
  listResponses,
  listMemberResponses,
  remainingPlaces,
  publicView,
  answersRecord,
  hasAnonymousReceipt,
  recoverResponseLink,
  respondToOffer,
  expireOffers,
  holdingByLevel,
} from "./services/responses";
export { fillOpenPlaces } from "./services/waitlist";
export { listFacilitators, setFacilitators, listFacilitatedForms } from "./services/facilitators";
export type { FacilitatorInput } from "./services/facilitators";
export { getAttendanceSheet, saveAttendance, participantName, HALF_LABEL } from "./services/attendance";
export type { AttendanceCell } from "./services/attendance";
export type { SubmitResult, Respondent, ResponseWithForm, PublicFormView } from "./services/responses";

export { exportResponses, STATUS_LABEL } from "./services/exports";
export { formResults, aggregate } from "./services/results";
export type { FormResults, QuestionResult, ParticipationSummary } from "./services/results";
export { listFormsForEvent } from "./services/events";
export type { EventForm } from "./services/events";
export { sendReceipt, resendManageLink, formPath } from "./services/notify";
export { runFormTasks, runFormPurge, sessionsEnd } from "./services/tasks";
