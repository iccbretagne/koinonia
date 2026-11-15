-- AlterTable
ALTER TABLE `serving_applications` ADD COLUMN `manageHash` VARCHAR(64) NULL,
    ADD COLUMN `manageSalt` VARCHAR(32) NULL,
    ADD COLUMN `schedulingReason` ENUM('NO_SLOT', 'DECLINED', 'CANDIDATE_CANCELLED', 'SLOT_REMOVED', 'NO_SHOW', 'EXCUSED') NULL,
    ADD COLUMN `schedulingRemindedAt` DATETIME(3) NULL,
    ADD COLUMN `schedulingSince` DATETIME(3) NULL,
    ADD COLUMN `slotsInvitedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `serving_settings` ADD COLUMN `schedulingReminderDays` INTEGER NOT NULL DEFAULT 14,
    ADD COLUMN `slotsOpenedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `serving_interview_slots` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `durationMinutes` INTEGER NOT NULL DEFAULT 30,
    `location` VARCHAR(200) NULL,
    `visioUrl` VARCHAR(500) NULL,
    `interviewerId` VARCHAR(191) NULL,
    `seriesId` VARCHAR(40) NULL,
    `bookedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serving_interview_slots_churchId_startsAt_idx`(`churchId`, `startsAt`),
    INDEX `serving_interview_slots_interviewerId_startsAt_idx`(`interviewerId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serving_interviews` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `slotId` VARCHAR(191) NULL,
    `status` ENUM('BOOKED', 'DONE', 'NO_SHOW', 'EXCUSED', 'CANCELLED') NOT NULL DEFAULT 'BOOKED',
    `startsAt` DATETIME(3) NOT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `location` VARCHAR(200) NULL,
    `visioUrl` VARCHAR(500) NULL,
    `interviewerId` VARCHAR(191) NULL,
    `cancelReason` ENUM('CANDIDATE', 'PVS', 'SLOT_REMOVED', 'REJECTED') NULL,
    `outcomeAt` DATETIME(3) NULL,
    `outcomeById` VARCHAR(191) NULL,
    `dayBeforeRemindedAt` DATETIME(3) NULL,
    `completionRemindedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serving_interviews_applicationId_createdAt_idx`(`applicationId`, `createdAt`),
    INDEX `serving_interviews_status_startsAt_idx`(`status`, `startsAt`),
    INDEX `serving_interviews_slotId_idx`(`slotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `serving_applications_manageHash_key` ON `serving_applications`(`manageHash`);

-- AddForeignKey
ALTER TABLE `serving_interview_slots` ADD CONSTRAINT `serving_interview_slots_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_interview_slots` ADD CONSTRAINT `serving_interview_slots_interviewerId_fkey` FOREIGN KEY (`interviewerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_interviews` ADD CONSTRAINT `serving_interviews_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `serving_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_interviews` ADD CONSTRAINT `serving_interviews_slotId_fkey` FOREIGN KEY (`slotId`) REFERENCES `serving_interview_slots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

