-- AlterTable: FamilyIntegrationRequest — appel au salut + lien événement
ALTER TABLE `family_integration_requests`
    ADD COLUMN `salvationCall` BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN `eventId`       VARCHAR(191) NULL,
    ADD INDEX `family_integration_requests_eventId_idx` (`eventId`);

-- AddForeignKey: FamilyIntegrationRequest.eventId -> events.id
ALTER TABLE `family_integration_requests`
    ADD CONSTRAINT `family_integration_requests_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `events`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: msdp_follow_ups
CREATE TABLE `msdp_follow_ups` (
    `id`                       VARCHAR(191) NOT NULL,
    `churchId`                 VARCHAR(191) NOT NULL,
    `requestId`                VARCHAR(191) NOT NULL,
    `status`                   ENUM('SUBMITTED','ASSIGNED','CONTACTED','IN_FORMATION','COMPLETED','ABANDONED') NOT NULL DEFAULT 'SUBMITTED',
    `assignedConseillerMsdpId` VARCHAR(191) NULL,
    `assignedAt`               DATETIME(3) NULL,
    `contactedAt`              DATETIME(3) NULL,
    `inFormationAt`            DATETIME(3) NULL,
    `completedAt`              DATETIME(3) NULL,
    `abandonedAt`              DATETIME(3) NULL,
    `integratedToFamily`       BOOLEAN NOT NULL DEFAULT FALSE,
    `isStar`                   BOOLEAN NOT NULL DEFAULT FALSE,
    `followsPcnc`              BOOLEAN NOT NULL DEFAULT FALSE,
    `notes`                    TEXT NULL,
    `createdAt`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`                DATETIME(3) NOT NULL,

    UNIQUE INDEX `msdp_follow_ups_requestId_key` (`requestId`),
    INDEX `msdp_follow_ups_churchId_status_idx` (`churchId`, `status`),
    INDEX `msdp_follow_ups_assignedConseillerMsdpId_idx` (`assignedConseillerMsdpId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: msdp_follow_ups.requestId -> family_integration_requests.id
ALTER TABLE `msdp_follow_ups`
    ADD CONSTRAINT `msdp_follow_ups_requestId_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `family_integration_requests`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: msdp_follow_ups.churchId -> churches.id
ALTER TABLE `msdp_follow_ups`
    ADD CONSTRAINT `msdp_follow_ups_churchId_fkey`
    FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: msdp_follow_ups.assignedConseillerMsdpId -> users.id
ALTER TABLE `msdp_follow_ups`
    ADD CONSTRAINT `msdp_follow_ups_assignedConseillerMsdpId_fkey`
    FOREIGN KEY (`assignedConseillerMsdpId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
