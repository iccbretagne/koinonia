-- AlterTable
ALTER TABLE `users` ADD COLUMN `assistantPersona` ENUM('NIA', 'KOI') NOT NULL DEFAULT 'NIA';

-- CreateTable
CREATE TABLE `assistant_settings` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_church_settings` (
    `churchId` VARCHAR(191) NOT NULL,
    `disabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`churchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_entries` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('CUSTOM', 'OVERRIDE') NOT NULL,
    `builtinKey` VARCHAR(40) NULL,
    `title` VARCHAR(200) NOT NULL,
    `questions` JSON NOT NULL,
    `answer` TEXT NOT NULL,
    `href` VARCHAR(200) NULL,
    `hrefLabel` VARCHAR(80) NULL,
    `roles` JSON NOT NULL,
    `module` VARCHAR(40) NULL,
    `screens` JSON NOT NULL,
    `disabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assistant_entries_builtinKey_key`(`builtinKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_pending_questions` (
    `id` VARCHAR(191) NOT NULL,
    `text` VARCHAR(300) NOT NULL,
    `reason` ENUM('UNANSWERED', 'NOT_HELPFUL') NOT NULL,
    `screen` VARCHAR(120) NULL,
    `role` VARCHAR(40) NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('OPEN', 'ANSWERED', 'LINKED', 'OFF_TOPIC') NOT NULL DEFAULT 'OPEN',
    `entryKey` VARCHAR(60) NULL,
    `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,

    INDEX `assistant_pending_questions_status_lastAt_idx`(`status`, `lastAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_aliases` (
    `id` VARCHAR(191) NOT NULL,
    `entryKey` VARCHAR(60) NOT NULL,
    `text` VARCHAR(300) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assistant_aliases_entryKey_idx`(`entryKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_daily_stats` (
    `day` DATE NOT NULL,
    `questions` INTEGER NOT NULL DEFAULT 0,
    `answered` INTEGER NOT NULL DEFAULT 0,
    `suggested` INTEGER NOT NULL DEFAULT 0,
    `unanswered` INTEGER NOT NULL DEFAULT 0,
    `dataAnswers` INTEGER NOT NULL DEFAULT 0,
    `helpful` INTEGER NOT NULL DEFAULT 0,
    `notHelpful` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assistant_embeddings` (
    `hash` CHAR(64) NOT NULL,
    `model` VARCHAR(80) NOT NULL,
    `vector` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`hash`, `model`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assistant_church_settings` ADD CONSTRAINT `assistant_church_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

