-- CreateTable
CREATE TABLE `media_gallery_grants` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `grantedById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `media_gallery_grants_userId_idx`(`userId`),
    INDEX `media_gallery_grants_grantedById_idx`(`grantedById`),
    UNIQUE INDEX `media_gallery_grants_churchId_userId_key`(`churchId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_gallery_grants` ADD CONSTRAINT `media_gallery_grants_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_gallery_grants` ADD CONSTRAINT `media_gallery_grants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_gallery_grants` ADD CONSTRAINT `media_gallery_grants_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
