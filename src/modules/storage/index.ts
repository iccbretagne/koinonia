import { defineModule } from "@/core/module-registry";

export {
  getPhotoOriginalKey,
  getPhotoThumbnailKey,
  getFileOriginalKey,
  getFileThumbnailKey,
  getZipKey,
  getVersionOriginalKey,
  getVersionThumbnailKey,
  getQuarantineKey,
  getSignedPutUrl,
  fileExists,
  downloadFile,
  uploadFile,
  getSignedThumbnailUrl,
  getSignedOriginalUrl,
  getSignedDownloadUrl,
  getSignedStreamUrl,
  getS3ObjectStream,
  deleteMediaFile,
  createMultipartUpload,
  getSignedPartUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  listUploadedParts,
} from "./services/s3";
export type { MediaContainer } from "./services/s3";

export { generateToken, isTokenExpired } from "./services/token";

/**
 * Module storage — primitifs de stockage S3 et de jeton, extraits de `media` (ADR-0006).
 *
 * Périmètre :
 *   - Client S3 (upload simple, multipart avec reprise, URLs signées)
 *   - Génération/validation de jetons opaques (liens sans authentification)
 *
 * N'a pas de modèle Prisma propre : les modules consommateurs (`media`, `audio`) portent
 * leurs propres tables et n'utilisent ce module que pour ces primitifs transverses.
 *
 * Dépendances : aucune (infrastructure pure)
 */
export const storageModule = defineModule({
  name: "storage",
  version: "1.0.0",
  dependsOn: [],
});
