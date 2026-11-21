-- AlterTable
ALTER TABLE `ticketing_event_roles` MODIFY `role` ENUM('ORGANIZER', 'TREASURER', 'RECEPTION', 'CATERING', 'OBSERVER', 'COMMUNICATION') NOT NULL;

-- CreateTable
CREATE TABLE `ticketing_site_settings` (
    `churchId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`churchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_sites` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(63) NOT NULL,
    `draft` JSON NOT NULL,
    `published` JSON NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedById` VARCHAR(191) NULL,
    `afterCloseDays` INTEGER NOT NULL DEFAULT 30,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ticketing_sites_eventId_key`(`eventId`),
    UNIQUE INDEX `ticketing_sites_slug_key`(`slug`),
    INDEX `ticketing_sites_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_site_assets` (
    `id` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ticketing_site_assets_siteId_idx`(`siteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_site_domains` (
    `id` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `host` VARCHAR(253) NOT NULL,
    `proofToken` VARCHAR(64) NOT NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'APPROVED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING',
    `lastCheckedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(300) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ticketing_site_domains_siteId_key`(`siteId`),
    UNIQUE INDEX `ticketing_site_domains_host_key`(`host`),
    INDEX `ticketing_site_domains_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ticketing_site_settings` ADD CONSTRAINT `ticketing_site_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_sites` ADD CONSTRAINT `ticketing_sites_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_site_assets` ADD CONSTRAINT `ticketing_site_assets_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `ticketing_sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_site_domains` ADD CONSTRAINT `ticketing_site_domains_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `ticketing_sites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

