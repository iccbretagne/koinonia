-- Migration: unified request model
-- Production state: announcements, announcement_events, service_requests,
--   departments.function (ENUM), events.allowAnnouncements already exist.

-- ─── 1. Convert departments.function from enum to varchar ─────────────
ALTER TABLE `departments` MODIFY COLUMN `function` VARCHAR(191) NULL;

-- ─── 2. events.allowAnnouncements already exists — ensure type matches ─
ALTER TABLE `events` MODIFY COLUMN `allowAnnouncements` BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. announcements & announcement_events already exist in prod ──────
-- Use CREATE TABLE IF NOT EXISTS so this works on both fresh and existing DBs.
-- Foreign keys use IF NOT EXISTS pattern via stored procedure or are idempotent.

CREATE TABLE IF NOT EXISTS `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `ministryId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `eventDate` DATETIME(3) NULL,
    `isSaveTheDate` BOOLEAN NOT NULL DEFAULT false,
    `isUrgent` BOOLEAN NOT NULL DEFAULT false,
    `channelInterne` BOOLEAN NOT NULL DEFAULT false,
    `channelExterne` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('EN_ATTENTE', 'EN_COURS', 'TRAITEE', 'ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `announcements_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `announcement_events` (
    `announcementId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`announcementId`, `eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 4. Create requests table (new — replaces service_requests) ───────
CREATE TABLE IF NOT EXISTS `requests` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `type` ENUM('VISUEL', 'DIFFUSION_INTERNE', 'RESEAUX_SOCIAUX', 'AJOUT_EVENEMENT', 'MODIFICATION_EVENEMENT', 'ANNULATION_EVENEMENT', 'MODIFICATION_PLANNING', 'DEMANDE_ACCES') NOT NULL,
    `status` ENUM('EN_ATTENTE', 'EN_COURS', 'APPROUVEE', 'EXECUTEE', 'LIVRE', 'REFUSEE', 'ANNULE', 'ERREUR') NOT NULL DEFAULT 'EN_ATTENTE',
    `title` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `assignedDeptId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `ministryId` VARCHAR(191) NULL,
    `announcementId` VARCHAR(191) NULL,
    `parentRequestId` VARCHAR(191) NULL,
    `reviewNotes` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `executedAt` DATETIME(3) NULL,
    `executionError` TEXT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `requests_churchId_type_status_idx`(`churchId`, `type`, `status`),
    INDEX `requests_assignedDeptId_status_idx`(`assignedDeptId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 5. Migrate data from service_requests → requests ─────────────────
-- Only runs if service_requests exists (production). Safe no-op on fresh DB.
INSERT IGNORE INTO `requests` (
    `id`, `churchId`, `type`, `status`, `title`, `payload`,
    `submittedById`, `assignedDeptId`, `departmentId`, `ministryId`,
    `announcementId`, `parentRequestId`, `reviewNotes`, `reviewedById`,
    `reviewedAt`, `executedAt`, `executionError`, `submittedAt`, `updatedAt`
)
SELECT
    `id`, `churchId`, `type`,
    CASE `status`
        WHEN 'EN_ATTENTE' THEN 'EN_ATTENTE'
        WHEN 'EN_COURS' THEN 'EN_COURS'
        WHEN 'LIVRE' THEN 'LIVRE'
        WHEN 'ANNULE' THEN 'ANNULE'
        ELSE 'EN_ATTENTE'
    END,
    COALESCE(`title`, ''),
    COALESCE(JSON_OBJECT(
        'brief', `brief`,
        'format', `format`,
        'deadline', `deadline`,
        'deliveryLink', `deliveryLink`
    ), '{}'),
    `submittedById`, `assignedDeptId`, NULL, NULL,
    `announcementId`, `parentRequestId`, `reviewNotes`, `reviewedById`,
    `reviewedAt`, NULL, NULL, `submittedAt`, `updatedAt`
FROM `service_requests`
WHERE NOT EXISTS (SELECT 1 FROM `requests` LIMIT 1);

-- ─── 6. Drop old service_requests table ───────────────────────────────
DROP TABLE IF EXISTS `service_requests`;

-- ─── 7. Foreign keys (idempotent — ignore if already exist) ───────────
-- Announcements
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcements_churchId_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcements` ADD CONSTRAINT `announcements_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcements_submittedById_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcements` ADD CONSTRAINT `announcements_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcements_departmentId_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcements` ADD CONSTRAINT `announcements_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcements_ministryId_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcements` ADD CONSTRAINT `announcements_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `ministries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Announcement events
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcement_events_announcementId_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcement_events` ADD CONSTRAINT `announcement_events_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME = 'announcement_events_eventId_fkey' AND TABLE_SCHEMA = DATABASE());
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE `announcement_events` ADD CONSTRAINT `announcement_events_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Requests
ALTER TABLE `requests` ADD CONSTRAINT `requests_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `ministries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_assignedDeptId_fkey` FOREIGN KEY (`assignedDeptId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_parentRequestId_fkey` FOREIGN KEY (`parentRequestId`) REFERENCES `requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `requests` ADD CONSTRAINT `requests_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
