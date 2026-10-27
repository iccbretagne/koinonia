-- CreateTable
CREATE TABLE `app_icon_variants` (
    `variant` VARCHAR(40) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `version` VARCHAR(32) NOT NULL,
    `background` CHAR(7) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `app_icon_variants_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`variant`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_icon_variants` ADD CONSTRAINT `app_icon_variants_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

