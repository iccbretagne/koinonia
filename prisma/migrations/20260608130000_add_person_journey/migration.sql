-- AlterTable
ALTER TABLE `msdp_follow_ups` DROP COLUMN `followsPcnc`,
    DROP COLUMN `integratedToFamily`,
    DROP COLUMN `isStar`;

-- CreateTable
CREATE TABLE `person_journeys` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(255) NULL,
    `sourceRequestId` VARCHAR(191) NULL,
    `integratedInFamily` BOOLEAN NOT NULL DEFAULT false,
    `familyIntegratedAt` DATETIME(3) NULL,
    `followsPcnc` BOOLEAN NOT NULL DEFAULT false,
    `pcncStartedAt` DATETIME(3) NULL,
    `isStar` BOOLEAN NOT NULL DEFAULT false,
    `starSince` DATETIME(3) NULL,
    `inDiscipleship` BOOLEAN NOT NULL DEFAULT false,
    `discipleshipSince` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `person_journeys_sourceRequestId_key`(`sourceRequestId`),
    INDEX `person_journeys_churchId_createdAt_idx`(`churchId`, `createdAt`),
    INDEX `person_journeys_churchId_integratedInFamily_idx`(`churchId`, `integratedInFamily`),
    INDEX `person_journeys_churchId_followsPcnc_idx`(`churchId`, `followsPcnc`),
    INDEX `person_journeys_churchId_isStar_idx`(`churchId`, `isStar`),
    INDEX `person_journeys_churchId_inDiscipleship_idx`(`churchId`, `inDiscipleship`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `person_journeys` ADD CONSTRAINT `person_journeys_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `family_integration_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person_journeys` ADD CONSTRAINT `person_journeys_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `person_journeys` ADD CONSTRAINT `person_journeys_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
