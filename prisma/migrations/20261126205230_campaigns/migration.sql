-- CreateTable
CREATE TABLE `campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `periodStart` DATE NULL,
    `periodEnd` DATE NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `fileRetentionDays` INTEGER NOT NULL DEFAULT 30,
    `rules` JSON NULL,
    `definitionHash` VARCHAR(64) NOT NULL,
    `openedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `filesPurgedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `campaigns_churchId_status_idx`(`churchId`, `status`),
    UNIQUE INDEX `campaigns_churchId_key_key`(`churchId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_managers` (
    `campaignId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `addedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `campaign_managers_userId_idx`(`userId`),
    PRIMARY KEY (`campaignId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_forms` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `position` INTEGER NOT NULL,
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `definition` JSON NOT NULL,
    `definitionHash` VARCHAR(64) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campaign_forms_campaignId_key_key`(`campaignId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `position` INTEGER NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'CHANGES_REQUESTED', 'VALIDATED') NOT NULL DEFAULT 'NOT_STARTED',
    `startedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedById` VARCHAR(191) NULL,
    `submittedByName` VARCHAR(150) NULL,
    `reviewReason` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `validatedAt` DATETIME(3) NULL,
    `validatedById` VARCHAR(191) NULL,
    `pastoralValidated` BOOLEAN NOT NULL DEFAULT false,
    `lastRemindedAt` DATETIME(3) NULL,
    `dueReminderSentAt` DATETIME(3) NULL,
    `definitionRevision` INTEGER NULL,

    INDEX `campaign_assignments_campaignId_status_idx`(`campaignId`, `status`),
    UNIQUE INDEX `campaign_assignments_formId_key_key`(`formId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_respondents` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `name` VARCHAR(150) NULL,
    `email` VARCHAR(254) NULL,
    `tokenSalt` VARCHAR(32) NULL,
    `tokenHash` VARCHAR(64) NULL,
    `addedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `campaign_respondents_tokenHash_key`(`tokenHash`),
    INDEX `campaign_respondents_userId_idx`(`userId`),
    UNIQUE INDEX `campaign_respondents_assignmentId_userId_key`(`assignmentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_answers` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `value` JSON NULL,
    `qualifier` ENUM('EXACT', 'ESTIMATE', 'TO_RESEARCH', 'NOT_APPLICABLE', 'NSP') NOT NULL DEFAULT 'EXACT',
    `note` VARCHAR(1000) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedByName` VARCHAR(150) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campaign_answers_assignmentId_code_key`(`assignmentId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_files` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `requestCode` VARCHAR(40) NOT NULL,
    `storageKey` VARCHAR(300) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `mime` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `uploadedByName` VARCHAR(150) NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `campaign_files_assignmentId_requestCode_idx`(`assignmentId`, `requestCode`),
    INDEX `campaign_files_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_managers` ADD CONSTRAINT `campaign_managers_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_managers` ADD CONSTRAINT `campaign_managers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_managers` ADD CONSTRAINT `campaign_managers_addedById_fkey` FOREIGN KEY (`addedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_forms` ADD CONSTRAINT `campaign_forms_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_assignments` ADD CONSTRAINT `campaign_assignments_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `campaign_forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_assignments` ADD CONSTRAINT `campaign_assignments_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_respondents` ADD CONSTRAINT `campaign_respondents_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `campaign_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_respondents` ADD CONSTRAINT `campaign_respondents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_answers` ADD CONSTRAINT `campaign_answers_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `campaign_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_files` ADD CONSTRAINT `campaign_files_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `campaign_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
