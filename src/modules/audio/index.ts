export { audioModule } from "./manifest";

export {
  createAudioService,
  updateAudioService,
  deleteAudioService,
  assertServiceEditable,
  EDITABLE_SERVICE_STATUSES,
} from "./services/service";
export type { CreateAudioServiceInput, UpdateAudioServiceInput } from "./services/service";

export { getCaptureDepartmentId, isCaptureTeamMember, isCaptureTeamLead } from "./services/access";

export {
  AUDIO_UPLOAD_PART_SIZE,
  AUDIO_UPLOAD_MAX_SIZE,
  AUDIO_UPLOAD_ALLOWED_MIME_TYPES,
  assertUploadWithinLimits,
  getAudioSourceKey,
  partCountFor,
  signSequenceUpload,
  getUploadedParts,
  completeSequenceUpload,
  deleteAudioSource,
  toJsonSafeAudioSource,
} from "./services/upload";
export type { SignSequenceUploadInput, SignedUpload, CompleteSequenceUploadInput, JsonSafeAudioSource } from "./services/upload";

export { validateSequences, applySequences } from "./services/sequences";
export type { SequenceInput } from "./services/sequences";

export { computeSourceHash, publishAudioService, unpublishAudioService, maybeCompletePublication } from "./services/publish";

export {
  createShareToken,
  resolveShareToken,
  revokeShareToken,
  getOrCreatePrimaryShareToken,
  getOrCreateSegmentShareToken,
  buildPublicAudioUrl,
} from "./services/tokens";
export type { CreateShareTokenInput } from "./services/tokens";

export {
  resolvePublicAudioService,
  recordAudioServiceOpen,
  mapPublishedSegments,
  resolveEffectiveCoverUrl,
} from "./services/public";
export type { PublicAudioResolution, PublicAudioService, PublicAudioSegment } from "./services/public";

export {
  ALLOWED_COVER_MIME_TYPES,
  MAX_COVER_SIZE,
  validateCoverFile,
  getCoverExtensionFromMimeType,
  getDefaultCoverKey,
} from "./services/settings";

export { listPublishedServices, listSpeakers, listSeries, getPublishedServiceForMember } from "./services/library";
export type { LibrarySort, ListPublishedServicesInput, LibraryServiceSummary } from "./services/library";

export {
  listAccessibleLibraryChurchIds,
  listAccessibleLibraryChurches,
  listOutgoingShares,
  grantLibraryShare,
  revokeLibraryShare,
} from "./services/sharing";
export type { AccessibleLibraryChurch, OutgoingShare, GrantLibraryShareResult } from "./services/sharing";

export { getCachedRenditionPath, primeRenditionCache, getCacheDir } from "./services/rendition-cache";
export { buildRenditionResponse } from "./services/stream";
