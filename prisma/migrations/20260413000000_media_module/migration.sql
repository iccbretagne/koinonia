-- Migration: module media (ex-Mediaflow)
-- Ajoute les tables du module média préfixées media_*.
-- Les colonnes User.mediaEventsCreated, Church.mediaEvents etc. sont des
-- relations Prisma-only (pas de colonnes BDD ajoutées côté parent).

-- ─── Enums ───────────────────────────────────────────────────────────────

-- Pas de création d'enums explicite en MariaDB/MySQL : Prisma les inline
-- dans les colonnes ENUM(…) directement.

-- ─── media_events ────────────────────────────────────────────────────────

CREATE TABLE `media_events` (
    `id`              VARCHAR(191) NOT NULL,
    `name`            VARCHAR(255) NOT NULL,
    `date`            DATETIME(3)  NOT NULL,
    `description`     TEXT         NULL,
    `status`          ENUM('DRAFT','PENDING_REVIEW','REVIEWED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `planningEventId` VARCHAR(191) NULL,
    `churchId`        VARCHAR(191) NOT NULL,
    `createdById`     VARCHAR(191) NOT NULL,
    `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`       DATETIME(3)  NOT NULL,

    INDEX `media_events_churchId_idx`(`churchId`),
    INDEX `media_events_createdById_idx`(`createdById`),
    INDEX `media_events_status_idx`(`status`),
    INDEX `media_events_date_idx`(`date`),
    INDEX `media_events_planningEventId_idx`(`planningEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_projects ───────────────────────────────────────────────────────

CREATE TABLE `media_projects` (
    `id`          VARCHAR(191) NOT NULL,
    `name`        VARCHAR(255) NOT NULL,
    `description` TEXT         NULL,
    `churchId`    VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL,

    INDEX `media_projects_churchId_idx`(`churchId`),
    INDEX `media_projects_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_photos ─────────────────────────────────────────────────────────

CREATE TABLE `media_photos` (
    `id`           VARCHAR(191)  NOT NULL,
    `filename`     VARCHAR(255)  NOT NULL,
    `originalKey`  VARCHAR(512)  NOT NULL,
    `thumbnailKey` VARCHAR(512)  NOT NULL,
    `mimeType`     VARCHAR(100)  NOT NULL,
    `size`         INT           NOT NULL,
    `width`        INT           NULL,
    `height`       INT           NULL,
    `status`       ENUM('PENDING','APPROVED','REJECTED','PREVALIDATED','PREREJECTED') NOT NULL DEFAULT 'PENDING',
    `validatedAt`  DATETIME(3)   NULL,
    `validatedBy`  VARCHAR(255)  NULL,
    `mediaEventId` VARCHAR(191)  NOT NULL,
    `uploadedAt`   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `media_photos_mediaEventId_idx`(`mediaEventId`),
    INDEX `media_photos_status_idx`(`status`),
    INDEX `media_photos_mediaEventId_status_idx`(`mediaEventId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_files ──────────────────────────────────────────────────────────

CREATE TABLE `media_files` (
    `id`                  VARCHAR(191) NOT NULL,
    `type`                ENUM('PHOTO','VISUAL','VIDEO') NOT NULL,
    `status`              ENUM('PENDING','APPROVED','REJECTED','PREVALIDATED','PREREJECTED','DRAFT','IN_REVIEW','REVISION_REQUESTED','FINAL_APPROVED') NOT NULL DEFAULT 'PENDING',
    `filename`            VARCHAR(255) NOT NULL,
    `mimeType`            VARCHAR(100) NOT NULL,
    `size`                INT          NOT NULL,
    `width`               INT          NULL,
    `height`              INT          NULL,
    `duration`            INT          NULL,
    `scheduledDeletionAt` DATETIME(3)  NULL,
    `mediaEventId`        VARCHAR(191) NULL,
    `mediaProjectId`      VARCHAR(191) NULL,
    `createdAt`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`           DATETIME(3)  NOT NULL,

    INDEX `media_files_mediaEventId_idx`(`mediaEventId`),
    INDEX `media_files_mediaProjectId_idx`(`mediaProjectId`),
    INDEX `media_files_type_idx`(`type`),
    INDEX `media_files_status_idx`(`status`),
    INDEX `media_files_scheduledDeletionAt_idx`(`scheduledDeletionAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_file_versions ──────────────────────────────────────────────────

CREATE TABLE `media_file_versions` (
    `id`            VARCHAR(191) NOT NULL,
    `versionNumber` INT          NOT NULL DEFAULT 1,
    `originalKey`   VARCHAR(512) NOT NULL,
    `thumbnailKey`  VARCHAR(512) NOT NULL,
    `notes`         TEXT         NULL,
    `mediaFileId`   VARCHAR(191) NOT NULL,
    `createdById`   VARCHAR(191) NOT NULL,
    `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_file_versions_mediaFileId_versionNumber_key`(`mediaFileId`, `versionNumber`),
    INDEX `media_file_versions_mediaFileId_idx`(`mediaFileId`),
    INDEX `media_file_versions_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_comments ───────────────────────────────────────────────────────

CREATE TABLE `media_comments` (
    `id`          VARCHAR(191) NOT NULL,
    `type`        ENUM('GENERAL','TIMECODE') NOT NULL DEFAULT 'GENERAL',
    `content`     TEXT         NOT NULL,
    `authorName`  VARCHAR(255) NULL,
    `authorImage` TEXT         NULL,
    `timecode`    INT          NULL,
    `parentId`    VARCHAR(191) NULL,
    `mediaFileId` VARCHAR(191) NOT NULL,
    `authorId`    VARCHAR(191) NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL,

    INDEX `media_comments_mediaFileId_idx`(`mediaFileId`),
    INDEX `media_comments_authorId_idx`(`authorId`),
    INDEX `media_comments_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_share_tokens ───────────────────────────────────────────────────

CREATE TABLE `media_share_tokens` (
    `id`             VARCHAR(191) NOT NULL,
    `token`          VARCHAR(64)  NOT NULL,
    `type`           ENUM('VALIDATOR','MEDIA','PREVALIDATOR','GALLERY') NOT NULL,
    `label`          VARCHAR(255) NULL,
    `config`         JSON         NULL,
    `expiresAt`      DATETIME(3)  NULL,
    `lastUsedAt`     DATETIME(3)  NULL,
    `usageCount`     INT          NOT NULL DEFAULT 0,
    `mediaEventId`   VARCHAR(191) NULL,
    `mediaProjectId` VARCHAR(191) NULL,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_share_tokens_token_key`(`token`),
    INDEX `media_share_tokens_mediaEventId_idx`(`mediaEventId`),
    INDEX `media_share_tokens_mediaProjectId_idx`(`mediaProjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_zip_jobs ───────────────────────────────────────────────────────

CREATE TABLE `media_zip_jobs` (
    `id`           VARCHAR(191) NOT NULL,
    `status`       ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
    `progress`     INT          NOT NULL DEFAULT 0,
    `downloadKey`  VARCHAR(512) NULL,
    `expiresAt`    DATETIME(3)  NULL,
    `error`        TEXT         NULL,
    `mediaEventId` VARCHAR(191) NOT NULL,
    `photoIds`     JSON         NOT NULL,
    `tokenId`      VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt`  DATETIME(3)  NULL,

    INDEX `media_zip_jobs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── media_settings ───────────────────────────────────────────────────────

CREATE TABLE `media_settings` (
    `id`              VARCHAR(191) NOT NULL DEFAULT 'default',
    `logoKey`         VARCHAR(512) NULL,
    `faviconKey`      VARCHAR(512) NULL,
    `logoFilename`    VARCHAR(255) NULL,
    `faviconFilename` VARCHAR(255) NULL,
    `retentionDays`   INT          NOT NULL DEFAULT 30,
    `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`       DATETIME(3)  NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Foreign keys ─────────────────────────────────────────────────────────

-- media_events
ALTER TABLE `media_events`
  ADD CONSTRAINT `media_events_planningEventId_fkey` FOREIGN KEY (`planningEventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `media_events_churchId_fkey`        FOREIGN KEY (`churchId`)        REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `media_events_createdById_fkey`     FOREIGN KEY (`createdById`)     REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- media_projects
ALTER TABLE `media_projects`
  ADD CONSTRAINT `media_projects_churchId_fkey`    FOREIGN KEY (`churchId`)    REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `media_projects_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- media_photos
ALTER TABLE `media_photos`
  ADD CONSTRAINT `media_photos_mediaEventId_fkey` FOREIGN KEY (`mediaEventId`) REFERENCES `media_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- media_files
ALTER TABLE `media_files`
  ADD CONSTRAINT `media_files_mediaEventId_fkey`   FOREIGN KEY (`mediaEventId`)   REFERENCES `media_events`(`id`)   ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `media_files_mediaProjectId_fkey` FOREIGN KEY (`mediaProjectId`) REFERENCES `media_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- media_file_versions
ALTER TABLE `media_file_versions`
  ADD CONSTRAINT `media_file_versions_mediaFileId_fkey`   FOREIGN KEY (`mediaFileId`)   REFERENCES `media_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `media_file_versions_createdById_fkey`   FOREIGN KEY (`createdById`)   REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- media_comments
ALTER TABLE `media_comments`
  ADD CONSTRAINT `media_comments_parentId_fkey`    FOREIGN KEY (`parentId`)    REFERENCES `media_comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `media_comments_mediaFileId_fkey` FOREIGN KEY (`mediaFileId`) REFERENCES `media_files`(`id`)    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `media_comments_authorId_fkey`    FOREIGN KEY (`authorId`)    REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- media_share_tokens
ALTER TABLE `media_share_tokens`
  ADD CONSTRAINT `media_share_tokens_mediaEventId_fkey`   FOREIGN KEY (`mediaEventId`)   REFERENCES `media_events`(`id`)   ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `media_share_tokens_mediaProjectId_fkey` FOREIGN KEY (`mediaProjectId`) REFERENCES `media_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
