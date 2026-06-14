-- Colonnes et tables ajoutées via db push, jamais capturées en migration.
-- IF NOT EXISTS les rend idempotentes sur les environnements où elles existent déjà.
ALTER TABLE `departments` ADD COLUMN IF NOT EXISTS `function` VARCHAR(191) NULL;
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `allowAnnouncements` BOOLEAN NOT NULL DEFAULT false;

-- service_requests existait en production avant d'être remplacée par requests.
-- Nécessaire pour la shadow DB : la migration unifiée fait un INSERT ... SELECT FROM service_requests.
CREATE TABLE IF NOT EXISTS `service_requests` (
    `id`              VARCHAR(191) NOT NULL,
    `churchId`        VARCHAR(191) NOT NULL,
    `type`            VARCHAR(191) NOT NULL,
    `status`          VARCHAR(191) NOT NULL DEFAULT 'EN_ATTENTE',
    `title`           VARCHAR(191) NULL,
    `brief`           TEXT NULL,
    `format`          VARCHAR(191) NULL,
    `deadline`        DATETIME(3) NULL,
    `deliveryLink`    VARCHAR(191) NULL,
    `submittedById`   VARCHAR(191) NOT NULL,
    `assignedDeptId`  VARCHAR(191) NULL,
    `announcementId`  VARCHAR(191) NULL,
    `parentRequestId` VARCHAR(191) NULL,
    `reviewNotes`     TEXT NULL,
    `reviewedById`    VARCHAR(191) NULL,
    `reviewedAt`      DATETIME(3) NULL,
    `submittedAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
