-- CreateTable
CREATE TABLE `system_messages` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `linkUrl` VARCHAR(500) NULL,
    `linkLabel` VARCHAR(60) NULL,
    `severity` ENUM('INFO', 'IMPORTANT', 'URGENT') NOT NULL DEFAULT 'INFO',
    `audience` JSON NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `notifiedAt` DATETIME(3) NULL,
    `recipientCount` INTEGER NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `system_messages_churchId_startsAt_idx`(`churchId`, `startsAt`),
    INDEX `system_messages_startsAt_endsAt_idx`(`startsAt`, `endsAt`),
    INDEX `system_messages_notifiedAt_startsAt_idx`(`notifiedAt`, `startsAt`),
    INDEX `system_messages_createdById_idx`(`createdById`),
    INDEX `system_messages_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_message_receipts` (
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dismissedAt` DATETIME(3) NULL,

    INDEX `system_message_receipts_userId_idx`(`userId`),
    PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `system_messages` ADD CONSTRAINT `system_messages_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_messages` ADD CONSTRAINT `system_messages_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_messages` ADD CONSTRAINT `system_messages_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_message_receipts` ADD CONSTRAINT `system_message_receipts_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `system_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_message_receipts` ADD CONSTRAINT `system_message_receipts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

