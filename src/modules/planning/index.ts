export { planningBus } from "./bus";
export type { PlanningEvents } from "./events";
export { executeRequest } from "./services/request-executor";
export type { ExecutionResult } from "./services/request-executor";
export { deleteEvents } from "./services/event.service";
export {
  collectEventChangeNotices,
  sendEventChangeNotices,
  emptyEventChangeNotices,
  mergeEventChangeNotices,
} from "./services/event-change-notices";
export type { EventChange, EventChangeNotices } from "./services/event-change-notices";
export { recordPlanningChanges, recordRemovedPlannings, flushPlanningChangeNotices } from "./services/planning-change-notices";
export type { PlanningChange } from "./services/planning-change-notices";
export {
  declareAbsence,
  cancelAbsence,
  updateAbsence,
  findAbsenceConflicts,
  resolveResponsibleUserIds,
  isMemberLinkedToUser,
  getMemberScope,
  getDeclarerBackupScope,
  validateBackupTargets,
  resolveSubjectUserId,
  listBackupOptions,
} from "./services/absence.service";
export type { AbsenceConflict, AbsenceTargeting, BackupInput, BackupOption } from "./services/absence.service";
export {
  absenceCovers,
  absenceCoverageWhere,
  effectiveDepartmentIds,
  lastEffectiveDate,
  validateTargeting,
  listTargetOptions,
  absenceVisibilityWhere,
  absenceDepartmentFilterWhere,
  findActiveAbsencesForPlanning,
} from "./services/absence-targeting";
export type {
  DeclarerScope,
  AbsenceCoverageShape,
  TargetEventSnapshot,
  TargetOptionDepartment,
  TargetOptionEvent,
  ActivePlanningAbsence,
} from "./services/absence-targeting";
export {
  canDepositAnnouncementSheet,
  canReadAnnouncementSheet,
  notifyReaders,
  validateSheetFile,
  getAnnouncementSheetKey,
  ALLOWED_SHEET_MIME_TYPES,
} from "./services/announcement-sheet.service";
export {
  canManageOpeningClosing,
  findActiveAbsenceForMember,
  notifyAssignment,
  notifyRemoval,
} from "./services/opening-closing.service";
export {
  listDepartmentTeamEvents,
  getTeamEventScopeInfo,
  createTeamEvent,
  updateTeamEvent,
  deleteTeamEvent,
  listTeamEventsForMember,
} from "./services/team-event.service";
export type {
  TeamEventDTO,
  TeamEventScopeInfo,
  RecurrenceRule,
  TeamEventUpdateScope,
  CreateTeamEventInput,
  CreateTeamEventResult,
  TeamEventWriteInput,
} from "./services/team-event.service";
export {
  searchMembersChurchWide,
  attachMemberToDepartment,
  detachMemberFromDepartment,
} from "./services/member-directory.service";
export type { MemberLookupResult } from "./services/member-directory.service";

export { registerAvailabilitySubscribers } from "./services/availability/subscribers";
export { runAvailabilityTasks, openCollectionNow, listCollectionMonths } from "./services/availability/collection";
export type { CollectionMonth } from "./services/availability/collection";
export {
  getAvailabilitySettings,
  updateAvailabilitySettings,
  DEFAULT_AVAILABILITY_SETTINGS,
} from "./services/availability/settings";
export { listMemberAvailability, saveResponses, listLinkedMemberIds } from "./services/availability/responses";
export { getPlanningAvailability } from "./services/availability/grid";
export { askTeam, manualRelance, assertEventDepartment } from "./services/availability/asks";
export { resolveAvailability, countsAsUnavailable, unavailabilityReason } from "./services/availability/state";
export type { AvailabilityState, ResolvedAvailability } from "./services/availability/state";
// Désistements et remplacements (spec 061)
export { withdrawable, replaceable, isPlannedStatus } from "./services/withdrawals/rules";
export { resolveWithdrawalRecipients } from "./services/withdrawals/recipients";
export { listReplacementCandidates } from "./services/withdrawals/candidates";
export type { ReplacementCandidate } from "./services/withdrawals/candidates";
export {
  createWithdrawal,
  withdrawService,
  sendWithdrawalNotice,
  resolveOwnMemberForDepartment,
} from "./services/withdrawals/withdraw";
export type { WithdrawalInput } from "./services/withdrawals/withdraw";
export { replaceWithdrawal, sendReplacedConfirmation } from "./services/withdrawals/replace";
export { cancelWithdrawal, closeWithdrawal } from "./services/withdrawals/resolve";
export { reconcileWithdrawalsAfterGridEdit } from "./services/withdrawals/reconcile";
export { runWithdrawalRelances } from "./services/withdrawals/relances";
export {
  listPendingWithdrawalsForSlot,
  listPendingWithdrawalsForMembers,
  getWithdrawalDetail,
} from "./services/withdrawals/queries";
export type { PendingSlotWithdrawal, PendingMemberWithdrawal, WithdrawalDetail } from "./services/withdrawals/queries";

export {
  PLANNED_STATUSES,
  isUpcoming,
  getStaffingGapViewer,
  countUnstaffedDepartments,
} from "./services/staffing-gaps";
export type { StaffingGapViewer } from "./services/staffing-gaps";
export { planningModule } from "./manifest";
