-- AlterTable
ALTER TABLE `availability_settings` ADD COLUMN `planningNoticeDelayMinutes` INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE `planning_change_notices` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `previousStatus` ENUM('EN_SERVICE', 'EN_SERVICE_DEBRIEF', 'INDISPONIBLE', 'REMPLACANT') NULL,
    `lastChangedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `planning_change_notices_churchId_lastChangedAt_idx`(`churchId`, `lastChangedAt`),
    UNIQUE INDEX `planning_change_notices_memberId_eventId_departmentId_key`(`memberId`, `eventId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
