-- DropForeignKey
ALTER TABLE `msdp_follow_ups` DROP FOREIGN KEY `msdp_follow_ups_requestId_fkey`;

-- AlterTable
ALTER TABLE `appointment_requests` ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `assignedById` VARCHAR(191) NULL,
    ADD COLUMN `assignedMemberId` VARCHAR(191) NULL,
    ADD COLUMN `outcome` ENUM('HELD', 'REFERRED_TO_FOLLOWUP', 'NO_SHOW') NULL,
    ADD COLUMN `outcomeAt` DATETIME(3) NULL,
    ADD COLUMN `personJourneyId` VARCHAR(191) NULL,
    ADD COLUMN `rejectReasonCode` ENUM('OUT_OF_SCOPE', 'DUPLICATE', 'WITHDRAWN', 'UNREACHABLE', 'REDIRECTED', 'OTHER') NULL,
    ADD COLUMN `scheduledFor` DATETIME(3) NULL,
    ADD COLUMN `sourceIntegrationRequestId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PENDING', 'VALIDATED', 'SCHEDULED', 'CLOSED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `msdp_follow_ups` ADD COLUMN `assignedById` VARCHAR(191) NULL,
    ADD COLUMN `assignedProfileId` VARCHAR(191) NULL,
    ADD COLUMN `email` VARCHAR(255) NULL,
    ADD COLUMN `firstName` VARCHAR(100) NULL,
    ADD COLUMN `lastName` VARCHAR(100) NULL,
    ADD COLUMN `personJourneyId` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(30) NULL,
    ADD COLUMN `sourceAppointmentId` VARCHAR(191) NULL,
    MODIFY `requestId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `care_settings` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `unassignedDelayDays` INTEGER NOT NULL DEFAULT 7,
    `unscheduledDelayDays` INTEGER NOT NULL DEFAULT 14,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `care_settings_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `appointment_requests_sourceIntegrationRequestId_key` ON `appointment_requests`(`sourceIntegrationRequestId`);

-- CreateIndex
CREATE INDEX `appointment_requests_assignedMemberId_idx` ON `appointment_requests`(`assignedMemberId`);

-- CreateIndex
CREATE INDEX `appointment_requests_personJourneyId_idx` ON `appointment_requests`(`personJourneyId`);

-- CreateIndex
CREATE UNIQUE INDEX `msdp_follow_ups_sourceAppointmentId_key` ON `msdp_follow_ups`(`sourceAppointmentId`);

-- CreateIndex
CREATE INDEX `msdp_follow_ups_assignedProfileId_idx` ON `msdp_follow_ups`(`assignedProfileId`);

-- CreateIndex
CREATE INDEX `msdp_follow_ups_personJourneyId_idx` ON `msdp_follow_ups`(`personJourneyId`);

-- AddForeignKey
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_assignedMemberId_fkey` FOREIGN KEY (`assignedMemberId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_personJourneyId_fkey` FOREIGN KEY (`personJourneyId`) REFERENCES `person_journeys`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `msdp_follow_ups` ADD CONSTRAINT `msdp_follow_ups_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `family_integration_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `msdp_follow_ups` ADD CONSTRAINT `msdp_follow_ups_assignedProfileId_fkey` FOREIGN KEY (`assignedProfileId`) REFERENCES `pastoral_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `msdp_follow_ups` ADD CONSTRAINT `msdp_follow_ups_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `msdp_follow_ups` ADD CONSTRAINT `msdp_follow_ups_sourceAppointmentId_fkey` FOREIGN KEY (`sourceAppointmentId`) REFERENCES `appointment_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `msdp_follow_ups` ADD CONSTRAINT `msdp_follow_ups_personJourneyId_fkey` FOREIGN KEY (`personJourneyId`) REFERENCES `person_journeys`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_settings` ADD CONSTRAINT `care_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

