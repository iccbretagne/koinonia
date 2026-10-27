-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `pushedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `endpointHash` CHAR(64) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `label` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSuccessAt` DATETIME(3) NULL,

    UNIQUE INDEX `push_subscriptions_endpointHash_key`(`endpointHash`),
    INDEX `push_subscriptions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_push_preferences` (
    `userId` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`, `domain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `notifications_pushedAt_createdAt_idx` ON `notifications`(`pushedAt`, `createdAt`);

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_push_preferences` ADD CONSTRAINT `notification_push_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Historique : jamais poussé à la mise en service (spec 068).
UPDATE `notifications` SET `pushedAt` = `createdAt`;
