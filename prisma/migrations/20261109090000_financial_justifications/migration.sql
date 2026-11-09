-- AlterTable
ALTER TABLE `financial_attachments` ADD COLUMN `justificationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `financial_requests` ADD COLUMN `justificationId` VARCHAR(191) NULL,
    ADD COLUMN `overageOfJustificationId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `financial_justifications` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `seriesId` VARCHAR(191) NULL,
    `period` CHAR(7) NULL,
    `status` ENUM('AWAITING', 'SUBMITTED', 'RETURN_DUE', 'SETTLED') NOT NULL DEFAULT 'AWAITING',
    `releasedAmount` DECIMAL(10, 2) NOT NULL,
    `releasedMonth` CHAR(7) NOT NULL,
    `spentAmount` DECIMAL(10, 2) NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `nextReminderAt` DATETIME(3) NOT NULL,
    `reminderCount` INTEGER NOT NULL DEFAULT 0,
    `submittedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `waiverReason` VARCHAR(500) NULL,
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `returnedAmount` DECIMAL(10, 2) NULL,
    `returnedAt` DATETIME(3) NULL,
    `returnedById` VARCHAR(191) NULL,
    `returnTreasuryAccountId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `financial_justifications_churchId_status_idx`(`churchId`, `status`),
    INDEX `financial_justifications_status_nextReminderAt_idx`(`status`, `nextReminderAt`),
    INDEX `financial_justifications_seriesId_period_idx`(`seriesId`, `period`),
    INDEX `financial_justifications_returnTreasuryAccountId_idx`(`returnTreasuryAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_justification_settings` (
    `churchId` VARCHAR(191) NOT NULL,
    `firstReminderDays` INTEGER NOT NULL DEFAULT 7,
    `reminderIntervalDays` INTEGER NOT NULL DEFAULT 7,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`churchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `financial_attachments_justificationId_idx` ON `financial_attachments`(`justificationId`);

-- CreateIndex
CREATE INDEX `financial_requests_justificationId_idx` ON `financial_requests`(`justificationId`);

-- CreateIndex
CREATE INDEX `financial_requests_overageOfJustificationId_idx` ON `financial_requests`(`overageOfJustificationId`);

-- AddForeignKey
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_justificationId_fkey` FOREIGN KEY (`justificationId`) REFERENCES `financial_justifications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_overageOfJustificationId_fkey` FOREIGN KEY (`overageOfJustificationId`) REFERENCES `financial_justifications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_attachments` ADD CONSTRAINT `financial_attachments_justificationId_fkey` FOREIGN KEY (`justificationId`) REFERENCES `financial_justifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_justifications` ADD CONSTRAINT `financial_justifications_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_justifications` ADD CONSTRAINT `financial_justifications_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `financial_series`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_justifications` ADD CONSTRAINT `financial_justifications_returnTreasuryAccountId_fkey` FOREIGN KEY (`returnTreasuryAccountId`) REFERENCES `treasury_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_justification_settings` ADD CONSTRAINT `financial_justification_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

