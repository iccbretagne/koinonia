-- CreateTable
CREATE TABLE `church_logos` (
    `churchId` VARCHAR(191) NOT NULL,
    `variant` VARCHAR(10) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `church_logos_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`churchId`, `variant`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `church_logos` ADD CONSTRAINT `church_logos_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `church_logos` ADD CONSTRAINT `church_logos_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

