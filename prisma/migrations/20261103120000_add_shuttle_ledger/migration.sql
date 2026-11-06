-- CreateTable
CREATE TABLE `shuttle_entries` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `kind` ENUM('OPENING_BALANCE', 'FUNDING', 'DEPOSIT_RETURN', 'VENDOR_REFUND', 'EXPENSE') NOT NULL,
    `category` ENUM('FUEL', 'MILEAGE', 'RENTAL', 'DEPOSIT', 'TOLL_PARKING', 'CLEANING', 'DAMAGE_FINE', 'INSURANCE', 'OTHER') NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `date` DATE NOT NULL,
    `label` VARCHAR(200) NULL,
    `vendor` VARCHAR(120) NULL,
    `paymentMethod` ENUM('TRANSFER', 'CASH', 'CHURCH_CARD', 'CHEQUE') NULL,
    `liters` DECIMAL(7, 2) NULL,
    `kilometers` INTEGER NULL,
    `personalAdvance` BOOLEAN NOT NULL DEFAULT false,
    `rentalId` VARCHAR(191) NULL,
    `returnOfId` VARCHAR(191) NULL,
    `depositRetainedAt` DATETIME(3) NULL,
    `depositRetainedNote` VARCHAR(300) NULL,
    `reimbursementRequestId` VARCHAR(191) NULL,
    `sourceRequestId` VARCHAR(191) NULL,
    `receiptKey` VARCHAR(512) NULL,
    `receiptName` VARCHAR(255) NULL,
    `receiptMime` VARCHAR(100) NULL,
    `receiptSize` INTEGER NULL,
    `flagNote` VARCHAR(300) NULL,
    `flaggedAt` DATETIME(3) NULL,
    `flaggedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shuttle_entries_returnOfId_key`(`returnOfId`),
    UNIQUE INDEX `shuttle_entries_reimbursementRequestId_key`(`reimbursementRequestId`),
    UNIQUE INDEX `shuttle_entries_sourceRequestId_key`(`sourceRequestId`),
    INDEX `shuttle_entries_churchId_deletedAt_date_idx`(`churchId`, `deletedAt`, `date`),
    INDEX `shuttle_entries_rentalId_idx`(`rentalId`),
    INDEX `shuttle_entries_createdById_idx`(`createdById`),
    INDEX `shuttle_entries_updatedById_idx`(`updatedById`),
    INDEX `shuttle_entries_flaggedById_idx`(`flaggedById`),
    INDEX `shuttle_entries_deletedById_idx`(`deletedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shuttle_rentals` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `vendor` VARCHAR(120) NOT NULL,
    `vehicle` VARCHAR(120) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shuttle_rentals_churchId_startDate_idx`(`churchId`, `startDate`),
    INDEX `shuttle_rentals_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shuttle_settings` (
    `churchId` VARCHAR(191) NOT NULL,
    `lowBalanceThreshold` DECIMAL(10, 2) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`churchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_rentalId_fkey` FOREIGN KEY (`rentalId`) REFERENCES `shuttle_rentals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_returnOfId_fkey` FOREIGN KEY (`returnOfId`) REFERENCES `shuttle_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_reimbursementRequestId_fkey` FOREIGN KEY (`reimbursementRequestId`) REFERENCES `financial_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `financial_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_flaggedById_fkey` FOREIGN KEY (`flaggedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_rentals` ADD CONSTRAINT `shuttle_rentals_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_rentals` ADD CONSTRAINT `shuttle_rentals_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_settings` ADD CONSTRAINT `shuttle_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

