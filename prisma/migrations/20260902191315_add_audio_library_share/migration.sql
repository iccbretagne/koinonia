-- CreateTable
CREATE TABLE `audio_library_shares` (
    `id` VARCHAR(191) NOT NULL,
    `ownerChurchId` VARCHAR(191) NOT NULL,
    `guestChurchId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audio_library_shares_guestChurchId_idx`(`guestChurchId`),
    UNIQUE INDEX `audio_library_shares_ownerChurchId_guestChurchId_key`(`ownerChurchId`, `guestChurchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audio_library_shares` ADD CONSTRAINT `audio_library_shares_ownerChurchId_fkey` FOREIGN KEY (`ownerChurchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_library_shares` ADD CONSTRAINT `audio_library_shares_guestChurchId_fkey` FOREIGN KEY (`guestChurchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

