-- AlterTable
ALTER TABLE `departments` ADD COLUMN `function` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `events` ADD COLUMN `allowAnnouncements` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `announcements` (
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

-- CreateTable
CREATE TABLE `announcement_events` (
    `announcementId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`announcementId`, `eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requests` (
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

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `ministries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_events` ADD CONSTRAINT `announcement_events_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_events` ADD CONSTRAINT `announcement_events_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `ministries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_assignedDeptId_fkey` FOREIGN KEY (`assignedDeptId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `announcements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_parentRequestId_fkey` FOREIGN KEY (`parentRequestId`) REFERENCES `requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requests` ADD CONSTRAINT `requests_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
