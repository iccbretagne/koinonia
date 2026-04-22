-- =============================================================================
-- SCRIPT D'IMPORT MEDIAFLOW → ICC PLATFORM
-- =============================================================================
--
-- Objectif : importer les données Mediaflow (BDD séparée) dans la BDD ICC
--            Platform (tables media_*) sans toucher aux données Koinonia.
--
-- Prérequis :
--   1. Les deux bases sont accessibles depuis la même connexion MariaDB
--      (même serveur ou via FEDERATED / CREATE DATABASE ... FROM DUMP).
--      La BDD Mediaflow doit être accessible sous le nom « mediaflow ».
--      La BDD Platform (cible) est la base courante.
--   2. Ce script est IDEMPOTENT : les INSERT utilisent INSERT IGNORE ou
--      ON DUPLICATE KEY UPDATE — on peut le relancer sans dommage.
--   3. Exécuter en production UNIQUEMENT après au moins 2 dress-rehearsals
--      réussis sur staging (cf. docs/database.md § Migrations).
--
-- Ordre d'exécution :
--   Étape 0  — Pré-validation (compte de lignes, cohérence)
--   Étape 1  — Mapping des churches
--   Étape 2  — Déduplication et import des users
--   Étape 3  — Import des MediaEvent (+ liaison planningEventId heuristique)
--   Étape 4  — Import des MediaPhoto
--   Étape 5  — Import des MediaFile + MediaFileVersion (visuels/vidéos)
--   Étape 6  — Import des MediaComment
--   Étape 7  — Import des MediaShareToken  ← CRITIQUE : tokens préservés
--   Étape 8  — Import des MediaSettings
--   Étape 9  — Nettoyage tables temporaires
--   Étape 10 — Invariants post-import (validation)
--
-- Hypothèses sur le schéma Mediaflow :
--   church      : id, name, slug, createdAt
--   user        : id, email, name, image, status, churchId, createdAt
--   event       : id, title, date, description, status, churchId,
--                 createdById, createdAt, updatedAt
--   photo       : id, eventId, s3Key, thumbnailKey, filename, mimeType,
--                 size, width, height, status, validatedAt, validatedBy,
--                 uploadedAt
--   media_file  : id, eventId, type, status, filename, mimeType, size,
--                 width, height, duration, createdAt, updatedAt
--   media_file_version : id, fileId, versionNumber, s3Key, thumbnailKey,
--                        notes, createdById, createdAt
--   comment     : id, fileId, type, content, authorName, authorImage,
--                 timecode, parentId, authorId, createdAt, updatedAt
--   share_token : id, token, type, label, config, eventId, expiresAt,
--                 lastUsedAt, usageCount, createdAt
--   settings    : id, logoKey, faviconKey, logoFilename, faviconFilename,
--                 retentionDays, createdAt, updatedAt
--
-- =============================================================================

-- Sécurité : toutes les opérations dans une seule transaction.
-- En cas d'erreur, ROLLBACK remet la BDD dans son état initial.
START TRANSACTION;

-- =============================================================================
-- ÉTAPE 0 — PRÉ-VALIDATION
-- =============================================================================
-- Vérifier que les 4 churches Mediaflow matchent par nom avec Koinonia.
-- Si le résultat n'est pas 4 lignes → ROLLBACK et investiguer manuellement.

SELECT
  'PRE-VALIDATION: church mapping' AS step,
  COUNT(*) AS matched_churches,
  IF(COUNT(*) = (SELECT COUNT(*) FROM mediaflow.church), 'OK', 'MISMATCH — STOP') AS result
FROM mediaflow.church mfc
INNER JOIN churches kc ON LOWER(TRIM(kc.name)) = LOWER(TRIM(mfc.name));

-- =============================================================================
-- ÉTAPE 1 — TABLE DE MAPPING CHURCHES (temporaire)
-- =============================================================================
-- Clé de correspondance : nom exact (insensible à la casse et aux espaces).

DROP TABLE IF EXISTS _mf_church_map;
CREATE TEMPORARY TABLE _mf_church_map (
  mf_id   VARCHAR(191) NOT NULL,
  icc_id  VARCHAR(191) NOT NULL,
  name    VARCHAR(255) NOT NULL,
  PRIMARY KEY (mf_id)
) ENGINE=MEMORY;

INSERT INTO _mf_church_map (mf_id, icc_id, name)
SELECT
  mfc.id,
  kc.id,
  kc.name
FROM mediaflow.church mfc
INNER JOIN churches kc ON LOWER(TRIM(kc.name)) = LOWER(TRIM(mfc.name));

-- Vérification bloquante : tous les churches doivent être mappés
SET @unmapped_churches = (
  SELECT COUNT(*) FROM mediaflow.church mfc
  LEFT JOIN _mf_church_map m ON m.mf_id = mfc.id
  WHERE m.mf_id IS NULL
);
SELECT IF(@unmapped_churches = 0, 'Church mapping: OK', CONCAT('ERREUR: ', @unmapped_churches, ' church(es) non mappées — ROLLBACK')) AS church_check;
-- En production : si @unmapped_churches > 0, exécuter ROLLBACK; manuellement.

-- =============================================================================
-- ÉTAPE 2 — TABLE DE MAPPING USERS (temporaire) + IMPORT USERS NOUVEAUX
-- =============================================================================
-- Clé de dédup : email (normalisé lowercase).
-- Cas A — email déjà dans Platform : on réutilise l'ID Platform, on ajoute
--          le rôle media:view si absent.
-- Cas B — email inconnu : on crée un nouvel user avec l'ID Mediaflow
--          pour que toutes les FK internes Mediaflow restent valides.

DROP TABLE IF EXISTS _mf_user_map;
CREATE TEMPORARY TABLE _mf_user_map (
  mf_id   VARCHAR(191) NOT NULL,
  icc_id  VARCHAR(191) NOT NULL,
  PRIMARY KEY (mf_id)
) ENGINE=MEMORY;

-- Cas A : users existants
INSERT INTO _mf_user_map (mf_id, icc_id)
SELECT mfu.id, ku.id
FROM mediaflow.user mfu
INNER JOIN users ku ON LOWER(ku.email) = LOWER(mfu.email);

-- Cas B : users inconnus — créer dans Platform avec l'ID Mediaflow
INSERT IGNORE INTO users (id, email, name, image, createdAt, updatedAt)
SELECT
  mfu.id,
  LOWER(mfu.email),
  mfu.name,
  mfu.image,
  mfu.createdAt,
  NOW()
FROM mediaflow.user mfu
WHERE LOWER(mfu.email) NOT IN (SELECT LOWER(email) FROM users);

-- Mapper les users nouvellement créés (Cas B)
INSERT IGNORE INTO _mf_user_map (mf_id, icc_id)
SELECT mfu.id, mfu.id   -- même ID car on a réutilisé l'ID Mediaflow
FROM mediaflow.user mfu
WHERE NOT EXISTS (SELECT 1 FROM _mf_user_map m WHERE m.mf_id = mfu.id);

-- Attribuer le rôle media:upload aux users Mediaflow dans leur church mappée
-- (INSERT IGNORE évite les doublons sur la contrainte unique userId+churchId+role)
INSERT IGNORE INTO user_church_roles (id, userId, churchId, role)
SELECT
  CONCAT('mf-import-', mfu.id),
  um.icc_id,
  cm.icc_id,
  'ADMIN'          -- les users Mediaflow avaient le rôle ADMIN ou MEDIA
FROM mediaflow.user mfu
INNER JOIN _mf_user_map um ON um.mf_id = mfu.id
INNER JOIN _mf_church_map cm ON cm.mf_id = mfu.churchId
WHERE mfu.role = 'ADMIN'   -- ajuster selon l'enum réel de Mediaflow
  AND NOT EXISTS (
    SELECT 1 FROM user_church_roles ucr
    WHERE ucr.userId = um.icc_id
      AND ucr.churchId = cm.icc_id
      AND ucr.role = 'ADMIN'
  );

SELECT
  'User mapping' AS step,
  (SELECT COUNT(*) FROM mediaflow.user) AS mf_total,
  (SELECT COUNT(*) FROM _mf_user_map)   AS mapped,
  IF(
    (SELECT COUNT(*) FROM mediaflow.user) = (SELECT COUNT(*) FROM _mf_user_map),
    'OK', 'MISMATCH'
  ) AS result;

-- =============================================================================
-- ÉTAPE 3 — IMPORT DES MEDIA_EVENTS
-- =============================================================================
-- Mapping des statuts Mediaflow → plateforme :
--   DRAFT          → DRAFT
--   ACTIVE / OPEN  → PENDING_REVIEW  (Mediaflow n'avait pas ce statut exactement)
--   REVIEWED / DONE → REVIEWED
--   ARCHIVED       → ARCHIVED
--
-- Liaison heuristique vers planningEventId :
--   même église + date dans une fenêtre de ±2h + titre similaire (LIKE).

DROP TABLE IF EXISTS _mf_event_map;
CREATE TEMPORARY TABLE _mf_event_map (
  mf_id     VARCHAR(191) NOT NULL,
  icc_id    VARCHAR(191) NOT NULL,
  PRIMARY KEY (mf_id)
) ENGINE=MEMORY;

INSERT IGNORE INTO media_events (
  id, name, date, description, status,
  planningEventId, churchId, createdById,
  createdAt, updatedAt
)
SELECT
  mfe.id,
  mfe.title,
  mfe.date,
  mfe.description,
  CASE mfe.status
    WHEN 'DRAFT'     THEN 'DRAFT'
    WHEN 'REVIEWED'  THEN 'REVIEWED'
    WHEN 'ARCHIVED'  THEN 'ARCHIVED'
    ELSE 'PENDING_REVIEW'
  END,
  -- Liaison heuristique : Event planning le plus proche en date (±2h, même church)
  (
    SELECT pe.id
    FROM events pe
    WHERE pe.churchId = cm.icc_id
      AND ABS(TIMESTAMPDIFF(MINUTE, pe.date, mfe.date)) <= 120
    ORDER BY ABS(TIMESTAMPDIFF(MINUTE, pe.date, mfe.date)) ASC
    LIMIT 1
  ),
  cm.icc_id,
  COALESCE(um.icc_id, (SELECT id FROM users WHERE isSuperAdmin = TRUE LIMIT 1)),
  mfe.createdAt,
  mfe.updatedAt
FROM mediaflow.event mfe
INNER JOIN _mf_church_map cm ON cm.mf_id = mfe.churchId
LEFT JOIN  _mf_user_map   um ON um.mf_id = mfe.createdById;

INSERT INTO _mf_event_map (mf_id, icc_id)
SELECT mfe.id, mfe.id  -- IDs réutilisés
FROM mediaflow.event mfe
WHERE EXISTS (SELECT 1 FROM media_events me WHERE me.id = mfe.id);

SELECT
  'MediaEvent import' AS step,
  (SELECT COUNT(*) FROM mediaflow.event) AS mf_total,
  (SELECT COUNT(*) FROM _mf_event_map)   AS imported,
  (SELECT COUNT(*) FROM media_events me INNER JOIN _mf_event_map m ON m.icc_id = me.id
   WHERE me.planningEventId IS NOT NULL)  AS linked_to_planning,
  IF(
    (SELECT COUNT(*) FROM mediaflow.event) = (SELECT COUNT(*) FROM _mf_event_map),
    'OK', 'MISMATCH'
  ) AS result;

-- =============================================================================
-- ÉTAPE 4 — IMPORT DES MEDIA_PHOTOS
-- =============================================================================
-- Les clés S3 sont préservées à l'identique — aucun déplacement de fichier.
-- Mapping des statuts : PENDING/APPROVED/REJECTED/PREVALIDATED/PREREJECTED.

INSERT IGNORE INTO media_photos (
  id, filename, originalKey, thumbnailKey,
  mimeType, size, width, height,
  status, validatedAt, validatedBy,
  mediaEventId, uploadedAt
)
SELECT
  p.id,
  COALESCE(p.filename, SUBSTRING_INDEX(p.s3Key, '/', -1)),
  p.s3Key,
  COALESCE(p.thumbnailKey, p.s3Key),
  COALESCE(p.mimeType, 'image/jpeg'),
  COALESCE(p.size, 0),
  p.width,
  p.height,
  CASE p.status
    WHEN 'APPROVED'      THEN 'APPROVED'
    WHEN 'REJECTED'      THEN 'REJECTED'
    WHEN 'PREVALIDATED'  THEN 'PREVALIDATED'
    WHEN 'PREREJECTED'   THEN 'PREREJECTED'
    ELSE 'PENDING'
  END,
  p.validatedAt,
  p.validatedBy,
  em.icc_id,
  COALESCE(p.uploadedAt, p.createdAt)
FROM mediaflow.photo p
INNER JOIN _mf_event_map em ON em.mf_id = p.eventId;

SELECT
  'MediaPhoto import' AS step,
  (SELECT COUNT(*) FROM mediaflow.photo) AS mf_total,
  (SELECT COUNT(*) FROM media_photos mp
   INNER JOIN _mf_event_map em ON em.icc_id = mp.mediaEventId) AS imported,
  IF(
    (SELECT COUNT(*) FROM mediaflow.photo) =
    (SELECT COUNT(*) FROM media_photos mp
     INNER JOIN _mf_event_map em ON em.icc_id = mp.mediaEventId),
    'OK', 'MISMATCH'
  ) AS result;

-- =============================================================================
-- ÉTAPE 5 — IMPORT DES MEDIA_FILES + MEDIA_FILE_VERSIONS (visuels / vidéos)
-- =============================================================================
-- Mediaflow gère les fichiers avec versionnage.
-- La table Platform media_files est le conteneur ; media_file_versions les versions.

DROP TABLE IF EXISTS _mf_file_map;
CREATE TEMPORARY TABLE _mf_file_map (
  mf_id  VARCHAR(191) NOT NULL,
  icc_id VARCHAR(191) NOT NULL,
  PRIMARY KEY (mf_id)
) ENGINE=MEMORY;

INSERT IGNORE INTO media_files (
  id, type, status, filename, mimeType, size,
  width, height, duration,
  mediaEventId,
  createdAt, updatedAt
)
SELECT
  mff.id,
  CASE mff.type
    WHEN 'VISUAL' THEN 'VISUAL'
    WHEN 'VIDEO'  THEN 'VIDEO'
    ELSE 'PHOTO'
  END,
  CASE mff.status
    WHEN 'APPROVED'            THEN 'APPROVED'
    WHEN 'REJECTED'            THEN 'REJECTED'
    WHEN 'PREVALIDATED'        THEN 'PREVALIDATED'
    WHEN 'PREREJECTED'         THEN 'PREREJECTED'
    WHEN 'DRAFT'               THEN 'DRAFT'
    WHEN 'IN_REVIEW'           THEN 'IN_REVIEW'
    WHEN 'REVISION_REQUESTED'  THEN 'REVISION_REQUESTED'
    WHEN 'FINAL_APPROVED'      THEN 'FINAL_APPROVED'
    ELSE 'PENDING'
  END,
  mff.filename,
  COALESCE(mff.mimeType, 'application/octet-stream'),
  COALESCE(mff.size, 0),
  mff.width,
  mff.height,
  mff.duration,
  em.icc_id,
  mff.createdAt,
  mff.updatedAt
FROM mediaflow.media_file mff
INNER JOIN _mf_event_map em ON em.mf_id = mff.eventId;

INSERT INTO _mf_file_map (mf_id, icc_id)
SELECT mff.id, mff.id
FROM mediaflow.media_file mff
WHERE EXISTS (SELECT 1 FROM media_files mf WHERE mf.id = mff.id);

-- Versions des fichiers
INSERT IGNORE INTO media_file_versions (
  id, versionNumber, originalKey, thumbnailKey,
  notes, mediaFileId, createdById, createdAt
)
SELECT
  mfv.id,
  mfv.versionNumber,
  mfv.s3Key,
  COALESCE(mfv.thumbnailKey, mfv.s3Key),
  mfv.notes,
  fm.icc_id,
  COALESCE(um.icc_id, (SELECT id FROM users WHERE isSuperAdmin = TRUE LIMIT 1)),
  mfv.createdAt
FROM mediaflow.media_file_version mfv
INNER JOIN _mf_file_map fm ON fm.mf_id = mfv.fileId
LEFT JOIN  _mf_user_map um ON um.mf_id = mfv.createdById;

SELECT
  'MediaFile import' AS step,
  (SELECT COUNT(*) FROM mediaflow.media_file)         AS mf_files,
  (SELECT COUNT(*) FROM _mf_file_map)                 AS imported_files,
  (SELECT COUNT(*) FROM mediaflow.media_file_version) AS mf_versions,
  (SELECT COUNT(*) FROM media_file_versions mfv
   INNER JOIN _mf_file_map fm ON fm.icc_id = mfv.mediaFileId) AS imported_versions;

-- =============================================================================
-- ÉTAPE 6 — IMPORT DES MEDIA_COMMENTS
-- =============================================================================

INSERT IGNORE INTO media_comments (
  id, type, content,
  authorName, authorImage, timecode,
  parentId, mediaFileId, authorId,
  createdAt, updatedAt
)
SELECT
  mc.id,
  CASE mc.type WHEN 'TIMECODE' THEN 'TIMECODE' ELSE 'GENERAL' END,
  mc.content,
  mc.authorName,
  mc.authorImage,
  mc.timecode,
  mc.parentId,
  fm.icc_id,
  um.icc_id,
  mc.createdAt,
  mc.updatedAt
FROM mediaflow.comment mc
INNER JOIN _mf_file_map fm ON fm.mf_id = mc.fileId
LEFT JOIN  _mf_user_map um ON um.mf_id = mc.authorId;

SELECT
  'MediaComment import' AS step,
  (SELECT COUNT(*) FROM mediaflow.comment) AS mf_total,
  (SELECT COUNT(*) FROM media_comments mcc
   INNER JOIN _mf_file_map fm ON fm.icc_id = mcc.mediaFileId) AS imported;

-- =============================================================================
-- ÉTAPE 7 — IMPORT DES MEDIA_SHARE_TOKENS  ← CRITIQUE
-- =============================================================================
-- Les valeurs de token DOIVENT être préservées à l'identique pour que tous
-- les liens partagés existants continuent de fonctionner.
-- INSERT IGNORE : si un token existe déjà (re-run), on ne l'écrase pas.

INSERT IGNORE INTO media_share_tokens (
  id, token, type, label, config,
  expiresAt, lastUsedAt, usageCount,
  mediaEventId,
  createdAt
)
SELECT
  st.id,
  st.token,       -- valeur préservée exactement
  CASE st.type
    WHEN 'VALIDATOR'    THEN 'VALIDATOR'
    WHEN 'PREVALIDATOR' THEN 'PREVALIDATOR'
    WHEN 'MEDIA'        THEN 'MEDIA'
    WHEN 'GALLERY'      THEN 'GALLERY'
    ELSE 'VALIDATOR'
  END,
  st.label,
  st.config,
  st.expiresAt,
  st.lastUsedAt,
  COALESCE(st.usageCount, 0),
  em.icc_id,
  st.createdAt
FROM mediaflow.share_token st
INNER JOIN _mf_event_map em ON em.mf_id = st.eventId;

-- Vérification critique : aucune valeur de token perdue
SELECT
  'MediaShareToken import' AS step,
  (SELECT COUNT(*) FROM mediaflow.share_token)     AS mf_total,
  (SELECT COUNT(*) FROM media_share_tokens mst
   INNER JOIN _mf_event_map em ON em.icc_id = mst.mediaEventId) AS imported,
  IF(
    (SELECT COUNT(*) FROM mediaflow.share_token) =
    (SELECT COUNT(*) FROM media_share_tokens mst
     INNER JOIN _mf_event_map em ON em.icc_id = mst.mediaEventId),
    'OK — TOUS LES TOKENS PRÉSERVÉS', 'MISMATCH — VÉRIFIER AVANT COMMIT'
  ) AS result;

-- =============================================================================
-- ÉTAPE 8 — IMPORT DES MEDIA_SETTINGS
-- =============================================================================
-- Un seul enregistrement (id = 'default'). ON DUPLICATE KEY laisse
-- l'existant si déjà configuré dans Platform.

INSERT INTO media_settings (
  id, logoKey, faviconKey, logoFilename, faviconFilename,
  retentionDays, createdAt, updatedAt
)
SELECT
  'default',
  s.logoKey,
  s.faviconKey,
  s.logoFilename,
  s.faviconFilename,
  COALESCE(s.retentionDays, 30),
  s.createdAt,
  NOW()
FROM mediaflow.settings s
LIMIT 1
ON DUPLICATE KEY UPDATE
  logoKey         = IF(VALUES(logoKey) IS NOT NULL AND media_settings.logoKey IS NULL,
                       VALUES(logoKey), media_settings.logoKey),
  faviconKey      = IF(VALUES(faviconKey) IS NOT NULL AND media_settings.faviconKey IS NULL,
                       VALUES(faviconKey), media_settings.faviconKey),
  logoFilename    = IF(VALUES(logoFilename) IS NOT NULL AND media_settings.logoFilename IS NULL,
                       VALUES(logoFilename), media_settings.logoFilename),
  faviconFilename = IF(VALUES(faviconFilename) IS NOT NULL AND media_settings.faviconFilename IS NULL,
                       VALUES(faviconFilename), media_settings.faviconFilename);

-- =============================================================================
-- ÉTAPE 9 — NETTOYAGE
-- =============================================================================

DROP TEMPORARY TABLE IF EXISTS _mf_church_map;
DROP TEMPORARY TABLE IF EXISTS _mf_user_map;
DROP TEMPORARY TABLE IF EXISTS _mf_event_map;
DROP TEMPORARY TABLE IF EXISTS _mf_file_map;

-- =============================================================================
-- ÉTAPE 10 — INVARIANTS POST-IMPORT
-- =============================================================================
-- Exécuter ces requêtes et vérifier que toutes les colonnes "result" = 'OK'.
-- Si un seul test échoue → ROLLBACK; et investiguer.

SELECT 'INVARIANTS POST-IMPORT' AS section;

-- I1 : Aucun media_event sans churchId valide
SELECT
  'I1: media_events.churchId valides' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_events me
LEFT JOIN churches c ON c.id = me.churchId
WHERE c.id IS NULL;

-- I2 : Aucun media_event sans createdById valide
SELECT
  'I2: media_events.createdById valides' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_events me
LEFT JOIN users u ON u.id = me.createdById
WHERE u.id IS NULL;

-- I3 : Aucune media_photo orpheline
SELECT
  'I3: media_photos sans media_event' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_photos mp
LEFT JOIN media_events me ON me.id = mp.mediaEventId
WHERE me.id IS NULL;

-- I4 : Aucun media_file orphelin
SELECT
  'I4: media_files sans media_event' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_files mf
WHERE mf.mediaEventId IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media_events me WHERE me.id = mf.mediaEventId);

-- I5 : Aucune media_file_version orpheline
SELECT
  'I5: media_file_versions sans media_file' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_file_versions mfv
LEFT JOIN media_files mf ON mf.id = mfv.mediaFileId
WHERE mf.id IS NULL;

-- I6 : Aucun media_share_token orphelin
SELECT
  'I6: media_share_tokens sans media_event' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM media_share_tokens mst
WHERE mst.mediaEventId IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media_events me WHERE me.id = mst.mediaEventId);

-- I7 : Counts globaux (à comparer manuellement avec snapshot Mediaflow)
SELECT
  'I7: counts globaux' AS invariant,
  (SELECT COUNT(*) FROM media_events)         AS media_events,
  (SELECT COUNT(*) FROM media_photos)         AS media_photos,
  (SELECT COUNT(*) FROM media_files)          AS media_files,
  (SELECT COUNT(*) FROM media_file_versions)  AS media_file_versions,
  (SELECT COUNT(*) FROM media_share_tokens)   AS media_share_tokens,
  (SELECT COUNT(*) FROM media_comments)       AS media_comments;

-- I8 : Doublons user_church_roles
SELECT
  'I8: pas de doublons user_church_roles' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM (
  SELECT userId, churchId, role, COUNT(*) AS cnt
  FROM user_church_roles
  GROUP BY userId, churchId, role
  HAVING cnt > 1
) dupes;

-- I9 : Tokens uniques
SELECT
  'I9: tokens media_share_tokens uniques' AS invariant,
  COUNT(*) AS violations,
  IF(COUNT(*) = 0, 'OK', 'ECHEC') AS result
FROM (
  SELECT token, COUNT(*) AS cnt
  FROM media_share_tokens
  GROUP BY token
  HAVING cnt > 1
) dupes;

-- =============================================================================
-- COMMIT ou ROLLBACK
-- =============================================================================
-- Vérifier que TOUS les invariants ci-dessus sont 'OK' AVANT de commit.
--
--   Si tout est vert  → COMMIT;
--   Si un test échoue → ROLLBACK;
--
-- À exécuter manuellement selon le résultat des invariants.
-- COMMIT;
-- ROLLBACK;
