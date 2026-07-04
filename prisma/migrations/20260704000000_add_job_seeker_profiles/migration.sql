-- Add wantSeekers flag to job notification subscriptions
ALTER TABLE `job_notification_subscriptions` ADD COLUMN `wantSeekers` BOOLEAN NOT NULL DEFAULT false;

-- Create job_seekers table
CREATE TABLE `job_seekers` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `wantEmploi` BOOLEAN NOT NULL DEFAULT false,
    `wantStage` BOOLEAN NOT NULL DEFAULT false,
    `wantAlternance` BOOLEAN NOT NULL DEFAULT false,
    `sector` VARCHAR(150) NULL,
    `location` VARCHAR(150) NULL,
    `remote` BOOLEAN NOT NULL DEFAULT false,
    `availableFrom` DATETIME(3) NULL,
    `description` LONGTEXT NOT NULL,
    `contactEmail` VARCHAR(150) NULL,
    `contactUrl` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'FOUND', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_seekers_status_idx`(`status`),
    INDEX `job_seekers_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign key constraint
ALTER TABLE `job_seekers` ADD CONSTRAINT `job_seekers_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
