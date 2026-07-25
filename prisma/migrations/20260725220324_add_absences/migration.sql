-- CreateTable
CREATE TABLE `absences` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `cancelledById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,

    INDEX `absences_churchId_startDate_endDate_idx`(`churchId`, `startDate`, `endDate`),
    INDEX `absences_memberId_status_idx`(`memberId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
