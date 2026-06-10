-- AlterTable: ajout accountingEmail sur Church
ALTER TABLE `churches` ADD COLUMN `accountingEmail` VARCHAR(191) NULL;

-- AlterEnum: ajout du rôle ACCOUNTANT
ALTER TABLE `user_church_roles` MODIFY COLUMN `role` ENUM('SUPER_ADMIN','ADMIN','SECRETARY','MINISTER','DEPARTMENT_HEAD','DISCIPLE_MAKER','REPORTER','STAR','AGENDA_QUALIFIER','ACCOUNTANT') NOT NULL;

-- CreateEnum: FinancialRequestType
-- CreateEnum: FinancialRequestStatus
-- CreateEnum: FinancialPriority
-- CreateEnum: RecurrenceUnit
-- CreateEnum: SeriesStatus
-- (Les enums Prisma sont des types applicatifs — pas de DDL MySQL nécessaire)

-- CreateTable: financial_series
CREATE TABLE `financial_series` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `type` ENUM('EXPENSE_REPORT','BUDGET_ADVANCE') NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `recurrenceEvery` INTEGER NOT NULL,
    `recurrenceUnit` ENUM('WEEK','MONTH') NOT NULL,
    `status` ENUM('ACTIVE','PAUSED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `nextOccurrenceDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `financial_series_churchId_status_idx`(`churchId`, `status`),
    INDEX `financial_series_nextOccurrenceDate_status_idx`(`nextOccurrenceDate`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: financial_requests
CREATE TABLE `financial_requests` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `seriesId` VARCHAR(191) NULL,
    `occurrenceNumber` INTEGER NULL,
    `correctionOfId` VARCHAR(191) NULL,
    `type` ENUM('EXPENSE_REPORT','BUDGET_ADVANCE') NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('SUBMITTED','PROCESSING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
    `priority` ENUM('URGENT','NORMAL') NULL,
    `priorityNote` VARCHAR(500) NULL,
    `rejectionReason` TEXT NULL,
    `processedById` VARCHAR(191) NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `financial_requests_churchId_status_idx`(`churchId`, `status`),
    INDEX `financial_requests_churchId_departmentId_status_idx`(`churchId`, `departmentId`, `status`),
    INDEX `financial_requests_submittedById_idx`(`submittedById`),
    INDEX `financial_requests_seriesId_idx`(`seriesId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: financial_attachments
CREATE TABLE `financial_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `s3Key` VARCHAR(512) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `financial_attachments_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: financial_payments
CREATE TABLE `financial_payments` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `scheduledDate` DATETIME(3) NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `releasedById` VARCHAR(191) NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `financial_payments_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: financial_series → churches
ALTER TABLE `financial_series` ADD CONSTRAINT `financial_series_churchId_fkey`
    FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_series → departments
ALTER TABLE `financial_series` ADD CONSTRAINT `financial_series_departmentId_fkey`
    FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_series → users (submitter)
ALTER TABLE `financial_series` ADD CONSTRAINT `financial_series_submittedById_fkey`
    FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → churches
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_churchId_fkey`
    FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → departments
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_departmentId_fkey`
    FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → users (submitter)
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_submittedById_fkey`
    FOREIGN KEY (`submittedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → users (processor)
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_processedById_fkey`
    FOREIGN KEY (`processedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → financial_series
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_seriesId_fkey`
    FOREIGN KEY (`seriesId`) REFERENCES `financial_series`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: financial_requests → financial_requests (correction)
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_correctionOfId_fkey`
    FOREIGN KEY (`correctionOfId`) REFERENCES `financial_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: financial_attachments → financial_requests
ALTER TABLE `financial_attachments` ADD CONSTRAINT `financial_attachments_requestId_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `financial_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: financial_payments → financial_requests
ALTER TABLE `financial_payments` ADD CONSTRAINT `financial_payments_requestId_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `financial_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: financial_payments → users (releaser)
ALTER TABLE `financial_payments` ADD CONSTRAINT `financial_payments_releasedById_fkey`
    FOREIGN KEY (`releasedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
