-- AlterTable
ALTER TABLE `form_responses` ADD COLUMN `levelId` VARCHAR(191) NULL,
    ADD COLUMN `previousLevelDone` BOOLEAN NULL,
    ADD COLUMN `sessionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `form_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `startDate` DATE NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 1,

    INDEX `form_sessions_formId_position_idx`(`formId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_levels` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `label` VARCHAR(150) NULL,
    `capacity` INTEGER NOT NULL,
    `isEntry` BOOLEAN NOT NULL DEFAULT false,

    INDEX `form_levels_sessionId_position_idx`(`sessionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_facilitators` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `allScope` BOOLEAN NOT NULL DEFAULT true,

    INDEX `form_facilitators_userId_idx`(`userId`),
    UNIQUE INDEX `form_facilitators_formId_userId_key`(`formId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_facilitator_scopes` (
    `id` VARCHAR(191) NOT NULL,
    `facilitatorId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `levelId` VARCHAR(191) NULL,

    INDEX `form_facilitator_scopes_facilitatorId_idx`(`facilitatorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_attendance` (
    `responseId` VARCHAR(191) NOT NULL,
    `day` INTEGER NOT NULL,
    `half` ENUM('AM', 'PM') NOT NULL,
    `present` BOOLEAN NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`responseId`, `day`, `half`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `form_responses_levelId_status_idx` ON `form_responses`(`levelId`, `status`);

-- CreateIndex
CREATE INDEX `form_responses_formId_waitingOn_status_idx` ON `form_responses`(`formId`, `waitingOn`, `status`);

-- AddForeignKey
ALTER TABLE `form_responses` ADD CONSTRAINT `form_responses_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `form_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_responses` ADD CONSTRAINT `form_responses_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `form_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_sessions` ADD CONSTRAINT `form_sessions_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_levels` ADD CONSTRAINT `form_levels_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `form_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_facilitators` ADD CONSTRAINT `form_facilitators_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_facilitators` ADD CONSTRAINT `form_facilitators_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_facilitator_scopes` ADD CONSTRAINT `form_facilitator_scopes_facilitatorId_fkey` FOREIGN KEY (`facilitatorId`) REFERENCES `form_facilitators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_facilitator_scopes` ADD CONSTRAINT `form_facilitator_scopes_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `form_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_facilitator_scopes` ADD CONSTRAINT `form_facilitator_scopes_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `form_levels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_attendance` ADD CONSTRAINT `form_attendance_responseId_fkey` FOREIGN KEY (`responseId`) REFERENCES `form_responses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
