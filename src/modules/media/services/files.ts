/**
 * Bornes des depots de fichiers media (visuels, videos) — hors photos, qui ont leurs
 * propres bornes dans `image.ts` (`MAX_PHOTO_SIZE`).
 *
 * Partagee par la route de signature (borne annoncee, refus precoce) et par la
 * confirmation de depot (borne reellement constatee sur l'objet depose, spec 029) :
 * une seule valeur, deux points d'application.
 */
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
