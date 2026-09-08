export { planningBus } from "./bus";
export type { PlanningEvents } from "./events";
export { executeRequest } from "./services/request-executor";
export type { ExecutionResult } from "./services/request-executor";
export { deleteEvents } from "./services/event.service";
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
export type { AbsenceConflict, BackupInput, BackupOption } from "./services/absence.service";

export { planningModule } from "./manifest";
