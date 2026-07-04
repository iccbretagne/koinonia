-- AddColumn: wantFreelanceMissions + wantFreelanceProfiles on job_notification_subscriptions
ALTER TABLE `job_notification_subscriptions`
  ADD COLUMN `wantFreelanceMissions` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `wantFreelanceProfiles` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: freelance_missions
CREATE TABLE `freelance_missions` (
  `id`           VARCHAR(191) NOT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `domain`       VARCHAR(150) NOT NULL,
  `duration`     VARCHAR(100) NULL,
  `dailyRate`    VARCHAR(100) NULL,
  `hourlyRate`   VARCHAR(100) NULL,
  `modality`     ENUM('REMOTE','ONSITE','HYBRID') NOT NULL DEFAULT 'REMOTE',
  `location`     VARCHAR(150) NULL,
  `description`  TEXT NOT NULL,
  `contactEmail` VARCHAR(150) NULL,
  `contactUrl`   VARCHAR(500) NULL,
  `status`       ENUM('ACTIVE','FILLED','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `authorId`     VARCHAR(191) NOT NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,

  INDEX `freelance_missions_status_idx`(`status`),
  INDEX `freelance_missions_authorId_idx`(`authorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: freelance_missions.authorId -> users.id
ALTER TABLE `freelance_missions`
  ADD CONSTRAINT `freelance_missions_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: freelance_profiles
CREATE TABLE `freelance_profiles` (
  `id`            VARCHAR(191) NOT NULL,
  `title`         VARCHAR(200) NOT NULL,
  `domain`        VARCHAR(150) NOT NULL,
  `dailyRate`     VARCHAR(100) NULL,
  `hourlyRate`    VARCHAR(100) NULL,
  `modality`      ENUM('REMOTE','ONSITE','HYBRID') NOT NULL DEFAULT 'REMOTE',
  `location`      VARCHAR(150) NULL,
  `availableFrom` DATETIME(3) NULL,
  `description`   TEXT NOT NULL,
  `contactEmail`  VARCHAR(150) NULL,
  `contactUrl`    VARCHAR(500) NULL,
  `status`        ENUM('ACTIVE','UNAVAILABLE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `authorId`      VARCHAR(191) NOT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,

  INDEX `freelance_profiles_status_idx`(`status`),
  INDEX `freelance_profiles_authorId_idx`(`authorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: freelance_profiles.authorId -> users.id
ALTER TABLE `freelance_profiles`
  ADD CONSTRAINT `freelance_profiles_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
