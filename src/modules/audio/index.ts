import { defineModule } from "@/core/module-registry";

/**
 * Module audio — publication des enregistrements de culte (dépôt, découpage/nommage,
 * publication, lecture publique) et bibliothèque d'écoute ouverte à tout membre (spec 021).
 * P1 : chemin « séquences déjà mixées/découpées » uniquement —
 * voir specs/019-audio-cultes-publication/plan.md.
 *
 * Dépendances : core (obligatoire), storage (S3 multipart), planning (lie un culte audio à un
 * événement via `planningEventId`).
 */
export const audioModule = defineModule({
  name: "audio",
  version: "1.0.0",
  dependsOn: ["core", "storage", "planning"],

  permissions: {
    // Écoute des cultes publiés (bibliothèque + fiche d'événement) — tout membre authentifié
    // (spec 021 : « restreindre la liste plus que le lien de partage n'aurait pas de sens »)
    "audio:listen":  ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD",
                       "DISCIPLE_MAKER", "REPORTER", "STAR", "AGENDA_QUALIFIER", "ACCOUNTANT"],
    // Accès en lecture à la file d'attente et aux cultes publiés (espace de production)
    "audio:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Dépôt de séquences (en plus de l'équipe de captation via isCaptureTeamMember)
    "audio:upload":  ["SUPER_ADMIN", "ADMIN", "SECRETARY"],
    // Corriger un découpage, publier/dépublier
    "audio:review":  ["SUPER_ADMIN", "ADMIN"],
    // Administration du module (paramètres — couverture, template de séquences)
    "audio:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  navigation: [
    { label: "Audio", icon: "audio", href: "/audio", permission: "audio:listen" },
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

export { getCachedRenditionPath, primeRenditionCache, getCacheDir } from "./services/rendition-cache";
export { buildRenditionResponse } from "./services/stream";
