import { defineModule } from "@/core/module-registry";

export { createMediaShareToken, validateMediaShareToken, getTokenUrlPath, isTokenExpired, generateToken } from "./services/tokens";
export { processImage, validatePhotoFile, getExtensionFromMimeType, ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_SIZE } from "./services/image";
export {
  uploadFile as uploadMediaFile,
  deleteMediaFile,
  getSignedThumbnailUrl,
  getSignedOriginalUrl,
  getSignedDownloadUrl,
  getPhotoOriginalKey,
  getPhotoThumbnailKey,
  getFileOriginalKey,
  getFileThumbnailKey,
  getZipKey,
  getVersionOriginalKey,
  getVersionThumbnailKey,
  createMultipartUpload,
  getSignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
} from "./services/s3";

/**
 * Module media — ex-Mediaflow.
 *
 * Périmètre :
 *   - Galeries photos événements (MediaEvent, MediaPhoto)
 *   - Projets média (MediaProject)
 *   - Fichiers média avec versionnage (MediaFile, MediaFileVersion)
 *   - Commentaires de révision (MediaComment)
 *   - Tokens de partage sans authentification (MediaShareToken)
 *   - Jobs ZIP asynchrones (MediaZipJob)
 *   - Paramètres du module (MediaSettings)
 *
 * Dépendances : core (obligatoire), planning (optionnelle — lien MediaEvent → Event planning)
 */
export const mediaModule = defineModule({
  name: "media",
  version: "1.0.0",
  dependsOn: ["core"],
  optionalDependencies: ["planning"],

  permissions: {
    // Accès en lecture aux galeries et médias
    "media:view":    ["SUPER_ADMIN", "ADMIN", "SECRETARY", "MINISTER", "DEPARTMENT_HEAD", "STAR"],
    // Upload, organisation, création de projets et événements médias
    "media:upload":  ["SUPER_ADMIN", "ADMIN", "SECRETARY", "STAR"],
    // Validation/rejet des photos et médias
    "media:review":  ["SUPER_ADMIN", "ADMIN"],
    // Administration du module (paramètres, tokens)
    "media:manage":  ["SUPER_ADMIN", "ADMIN"],
  },

  navigation: [
    { label: "Médias", icon: "media", href: "/media", permission: "media:view" },
  ],
});
