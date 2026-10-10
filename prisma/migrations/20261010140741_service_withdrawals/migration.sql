-- CreateTable
CREATE TABLE `service_withdrawals` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `originalStatus` ENUM('EN_SERVICE', 'EN_SERVICE_DEBRIEF', 'INDISPONIBLE', 'REMPLACANT') NOT NULL,
    `message` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'REPLACED', 'CANCELLED', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    `createdById` VARCHAR(191) NULL,
    `replacementMemberId` VARCHAR(191) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `relanceSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_withdrawals_eventId_departmentId_status_idx`(`eventId`, `departmentId`, `status`),
    INDEX `service_withdrawals_memberId_status_idx`(`memberId`, `status`),
    INDEX `service_withdrawals_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_replacementMemberId_fkey` FOREIGN KEY (`replacementMemberId`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
