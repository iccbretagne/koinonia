-- CreateTable
CREATE TABLE `cron_task_runs` (
    `key` VARCHAR(191) NOT NULL,
    `lastStartedAt` DATETIME(3) NULL,
    `lastFinishedAt` DATETIME(3) NULL,
    `lastDurationMs` INTEGER NULL,
    `lastError` TEXT NULL,
    `lockedUntil` DATETIME(3) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
