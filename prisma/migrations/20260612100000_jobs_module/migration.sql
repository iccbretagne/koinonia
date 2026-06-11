-- CreateEnum
CREATE TABLE IF NOT EXISTS `__prisma_migrations` (id VARCHAR(36) NOT NULL, checksum VARCHAR(64) NOT NULL, finished_at DATETIME(3) NULL, migration_name VARCHAR(255) NOT NULL, logs TEXT NULL, rolled_back_at DATETIME(3) NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), applied_steps_count INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (`id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: job_offers
CREATE TABLE `job_offers` (
  `id`           VARCHAR(191) NOT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `type`         ENUM('EMPLOI', 'STAGE', 'ALTERNANCE') NOT NULL,
  `company`      VARCHAR(150) NOT NULL,
  `location`     VARCHAR(150) NULL,
  `description`  TEXT NOT NULL,
  `duration`     VARCHAR(100) NULL,
  `deadline`     DATETIME(3) NULL,
  `contactEmail` VARCHAR(150) NULL,
  `contactUrl`   VARCHAR(500) NULL,
  `status`       ENUM('PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'PUBLISHED',
  `authorId`     VARCHAR(191) NOT NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `job_offers_status_type_idx` (`status`, `type`),
  INDEX `job_offers_authorId_idx` (`authorId`),
  CONSTRAINT `job_offers_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: job_notification_subscriptions
CREATE TABLE `job_notification_subscriptions` (
  `id`             VARCHAR(191) NOT NULL,
  `userId`         VARCHAR(191) NOT NULL,
  `inApp`          BOOLEAN NOT NULL DEFAULT true,
  `email`          BOOLEAN NOT NULL DEFAULT false,
  `wantEmploi`     BOOLEAN NOT NULL DEFAULT true,
  `wantStage`      BOOLEAN NOT NULL DEFAULT true,
  `wantAlternance` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `job_notification_subscriptions_userId_key` (`userId`),
  CONSTRAINT `job_notification_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
