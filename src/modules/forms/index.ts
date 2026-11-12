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
  listForms,
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
} from "./services/responses";
export type { SubmitResult, Respondent, ResponseWithForm, PublicFormView } from "./services/responses";

export { exportResponses, STATUS_LABEL } from "./services/exports";
export { sendReceipt, resendManageLink, formPath } from "./services/notify";
export { runFormTasks, runFormPurge } from "./services/tasks";
