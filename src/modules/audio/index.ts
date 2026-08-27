import { defineModule } from "@/core/module-registry";

/**
 * Module audio — publication des enregistrements de culte (dépôt, découpage/nommage,
 * publication, lecture publique). P1 : chemin « séquences déjà mixées/découpées » uniquement
 * — voir specs/019-audio-cultes-publication/plan.md.
 *
 * Dépendances : core (obligatoire), storage (S3 multipart), planning (lie un culte audio à un
 * événement via `planningEventId`).
 */
export const audioModule = defineModule({
  name: "audio",
  version: "1.0.0",
  dependsOn: ["core", "storage", "planning"],

  permissions: {
    // Accès en lecture à la file d'attente et aux cultes publiés
    "audio:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Dépôt de séquences (en plus de l'équipe de captation via isCaptureTeamMember)
    "audio:upload":  ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Corriger un découpage, publier/dépublier
    "audio:review":  ["SUPER_ADMIN", "ADMIN"],
    // Administration du module (paramètres — département de captation, couverture, template)
    "audio:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  navigation: [
    { label: "Audio", icon: "audio", href: "/audio", permission: "audio:view" },
  ],
});

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
  buildPublicAudioUrl,
} from "./services/tokens";
export type { CreateShareTokenInput } from "./services/tokens";

export { resolvePublicAudioService, recordAudioServiceOpen } from "./services/public";
export type { PublicAudioResolution, PublicAudioService, PublicAudioSegment } from "./services/public";

export {
  ALLOWED_COVER_MIME_TYPES,
  MAX_COVER_SIZE,
  validateCoverFile,
  getCoverExtensionFromMimeType,
  getDefaultCoverKey,
} from "./services/settings";
