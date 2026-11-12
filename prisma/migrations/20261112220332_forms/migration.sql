-- CreateTable
CREATE TABLE `forms` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `kind` ENUM('REGISTRATION', 'PARTICIPATION', 'SURVEY') NOT NULL,
    `access` ENUM('PUBLIC', 'MEMBERS') NOT NULL,
    `anonymous` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'PUBLISHED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `opensAt` DATETIME(3) NULL,
    `closesAt` DATETIME(3) NULL,
    `maxResponses` INTEGER NULL,
    `waitlistEnabled` BOOLEAN NOT NULL DEFAULT false,
    `offerHoldHours` INTEGER NOT NULL DEFAULT 48,
    `retentionMonths` INTEGER NOT NULL DEFAULT 12,
    `eventId` VARCHAR(191) NULL,
    `ticketingEventId` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `purgedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `totals` JSON NULL,
    `notifiedCount` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `forms_status_closesAt_idx`(`status`, `closesAt`),
    INDEX `forms_eventId_idx`(`eventId`),
    INDEX `forms_ticketingEventId_idx`(`ticketingEventId`),
    UNIQUE INDEX `forms_churchId_slug_key`(`churchId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_questions` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `type` ENUM('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'NUMBER', 'DATE', 'EMAIL', 'PHONE', 'RATING', 'CONSENT', 'SESSION_LEVEL') NOT NULL,
    `label` VARCHAR(300) NOT NULL,
    `help` VARCHAR(500) NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `config` JSON NULL,
    `conditionQuestionId` VARCHAR(191) NULL,
    `conditionValue` VARCHAR(100) NULL,

    INDEX `form_questions_formId_position_idx`(`formId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_choices` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `capacity` INTEGER NULL,

    INDEX `form_choices_questionId_position_idx`(`questionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_responses` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `status` ENUM('CONFIRMED', 'WAITLISTED', 'OFFERED', 'CANCELLED', 'DECLINED', 'EXPIRED') NOT NULL DEFAULT 'CONFIRMED',
    `userId` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(254) NULL,
    `contactKey` VARCHAR(64) NULL,
    `waitingOn` VARCHAR(191) NULL,
    `offerExpiresAt` DATETIME(3) NULL,
    `manageSalt` VARCHAR(32) NULL,
    `manageHash` VARCHAR(64) NULL,
    `submittedOn` DATE NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `modifiedAt` DATETIME(3) NULL,

    UNIQUE INDEX `form_responses_manageHash_key`(`manageHash`),
    INDEX `form_responses_formId_status_idx`(`formId`, `status`),
    INDEX `form_responses_formId_contactKey_idx`(`formId`, `contactKey`),
    INDEX `form_responses_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_answers` (
    `id` VARCHAR(191) NOT NULL,
    `responseId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,

    INDEX `form_answers_questionId_idx`(`questionId`),
    UNIQUE INDEX `form_answers_responseId_questionId_key`(`responseId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_response_choices` (
    `responseId` VARCHAR(191) NOT NULL,
    `choiceId` VARCHAR(191) NOT NULL,

    INDEX `form_response_choices_choiceId_idx`(`choiceId`),
    PRIMARY KEY (`responseId`, `choiceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `form_anonymous_receipts` (
    `formId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`formId`, `keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `forms` ADD CONSTRAINT `forms_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forms` ADD CONSTRAINT `forms_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forms` ADD CONSTRAINT `forms_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forms` ADD CONSTRAINT `forms_ticketingEventId_fkey` FOREIGN KEY (`ticketingEventId`) REFERENCES `ticketing_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_questions` ADD CONSTRAINT `form_questions_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_choices` ADD CONSTRAINT `form_choices_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `form_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_responses` ADD CONSTRAINT `form_responses_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_responses` ADD CONSTRAINT `form_responses_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_answers` ADD CONSTRAINT `form_answers_responseId_fkey` FOREIGN KEY (`responseId`) REFERENCES `form_responses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_answers` ADD CONSTRAINT `form_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `form_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_response_choices` ADD CONSTRAINT `form_response_choices_responseId_fkey` FOREIGN KEY (`responseId`) REFERENCES `form_responses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_response_choices` ADD CONSTRAINT `form_response_choices_choiceId_fkey` FOREIGN KEY (`choiceId`) REFERENCES `form_choices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_anonymous_receipts` ADD CONSTRAINT `form_anonymous_receipts_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
