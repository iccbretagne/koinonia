-- CreateTable
CREATE TABLE `audio_settings` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `captureDepartmentId` VARCHAR(191) NULL,
    `defaultCoverKey` VARCHAR(512) NULL,
    `sequenceTemplate` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `audio_settings_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_services` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `planningEventId` VARCHAR(191) NULL,
    `serviceDate` DATETIME(3) NOT NULL,
    `title` VARCHAR(191) NULL,
    `speaker` VARCHAR(191) NULL,
    `coverKey` VARCHAR(512) NULL,
    `status` ENUM('DRAFT', 'PENDING_REVIEW', 'READY', 'PUBLISHED', 'UNPUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `publishedById` VARCHAR(191) NULL,
    `openCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `audio_services_planningEventId_key`(`planningEventId`),
    INDEX `audio_services_churchId_status_idx`(`churchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_sources` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SEQUENCE', 'MIX', 'ENVELOPES', 'SOURCE') NOT NULL,
    `channelKey` VARCHAR(191) NULL,
    `s3Key` VARCHAR(512) NOT NULL,
    `durationMs` INTEGER NULL,
    `sizeBytes` BIGINT NULL,
    `uploadStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `purgeableAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audio_sources_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_segments` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL,
    `kind` ENUM('SEQUENCE', 'DISCARDED') NOT NULL DEFAULT 'SEQUENCE',
    `title` VARCHAR(191) NOT NULL,
    `startMs` INTEGER NOT NULL,
    `endMs` INTEGER NOT NULL,
    `confidence` DOUBLE NULL,
    `detectedBy` VARCHAR(191) NULL,
    `playCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `audio_segments_sourceId_key`(`sourceId`),
    INDEX `audio_segments_serviceId_kind_idx`(`serviceId`, `kind`),
    UNIQUE INDEX `audio_segments_serviceId_order_key`(`serviceId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_renditions` (
    `id` VARCHAR(191) NOT NULL,
    `segmentId` VARCHAR(191) NOT NULL,
    `s3Key` VARCHAR(512) NOT NULL,
    `format` VARCHAR(191) NOT NULL DEFAULT 'mp3',
    `durationMs` INTEGER NOT NULL,
    `lufs` DOUBLE NOT NULL,
    `truePeakDb` DOUBLE NOT NULL,
    `sourceHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `audio_renditions_segmentId_key`(`segmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_service_templates` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NULL,
    `sequenceNames` JSON NOT NULL,
    `mixingProfile` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `audio_service_templates_churchId_eventType_key`(`churchId`, `eventType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `type` ENUM('PROBE', 'RENDER', 'ALIGN', 'TRANSCRIBE') NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leasedUntil` DATETIME(3) NULL,
    `payload` JSON NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `audio_jobs_status_leasedUntil_idx`(`status`, `leasedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_share_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `segmentId` VARCHAR(191) NULL,
    `token` VARCHAR(191) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `audio_share_tokens_token_key`(`token`),
    INDEX `audio_share_tokens_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audio_settings` ADD CONSTRAINT `audio_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_settings` ADD CONSTRAINT `audio_settings_captureDepartmentId_fkey` FOREIGN KEY (`captureDepartmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_services` ADD CONSTRAINT `audio_services_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_services` ADD CONSTRAINT `audio_services_planningEventId_fkey` FOREIGN KEY (`planningEventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_sources` ADD CONSTRAINT `audio_sources_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `audio_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_segments` ADD CONSTRAINT `audio_segments_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `audio_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_segments` ADD CONSTRAINT `audio_segments_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `audio_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_renditions` ADD CONSTRAINT `audio_renditions_segmentId_fkey` FOREIGN KEY (`segmentId`) REFERENCES `audio_segments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_service_templates` ADD CONSTRAINT `audio_service_templates_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_jobs` ADD CONSTRAINT `audio_jobs_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `audio_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_share_tokens` ADD CONSTRAINT `audio_share_tokens_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `audio_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_share_tokens` ADD CONSTRAINT `audio_share_tokens_segmentId_fkey` FOREIGN KEY (`segmentId`) REFERENCES `audio_segments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
