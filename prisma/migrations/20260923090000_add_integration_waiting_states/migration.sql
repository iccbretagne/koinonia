-- AlterTable
ALTER TABLE `family_integration_requests` ADD COLUMN `contactConsent` ENUM('NOW', 'LATER') NOT NULL DEFAULT 'NOW',
    ADD COLUMN `lastRelanceAt` DATETIME(3) NULL,
    ADD COLUMN `waitingFrom` ENUM('SUBMITTED', 'WAITING_RECONTACT', 'WAITING_MISSION', 'ASSIGNED', 'CONTACTED', 'WHATSAPP_ADDED', 'INTEGRATED', 'ABANDONED') NULL,
    ADD COLUMN `waitingSince` DATETIME(3) NULL,
    MODIFY `status` ENUM('SUBMITTED', 'WAITING_RECONTACT', 'WAITING_MISSION', 'ASSIGNED', 'CONTACTED', 'WHATSAPP_ADDED', 'INTEGRATED', 'ABANDONED') NOT NULL DEFAULT 'SUBMITTED';

-- CreateTable
CREATE TABLE `integration_settings` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `recontactDelayDays` INTEGER NOT NULL DEFAULT 60,
    `missionDelayDays` INTEGER NOT NULL DEFAULT 30,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `integration_settings_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `integration_settings` ADD CONSTRAINT `integration_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

