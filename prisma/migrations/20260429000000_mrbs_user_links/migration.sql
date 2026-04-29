-- CreateTable
CREATE TABLE `mrbs_user_links` (
    `id` VARCHAR(191) NOT NULL,
    `mrbsUsername` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `linkedById` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `mrbs_user_links_mrbsUsername_key`(`mrbsUsername`),
    INDEX `mrbs_user_links_userId_idx`(`userId`),
    INDEX `mrbs_user_links_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mrbs_user_links` ADD CONSTRAINT `mrbs_user_links_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mrbs_user_links` ADD CONSTRAINT `mrbs_user_links_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mrbs_user_links` ADD CONSTRAINT `mrbs_user_links_linkedById_fkey` FOREIGN KEY (`linkedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
