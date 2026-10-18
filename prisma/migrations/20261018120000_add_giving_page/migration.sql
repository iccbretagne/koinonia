-- CreateTable
CREATE TABLE `giving_pages` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `intro` TEXT NULL,
    `onlineEnabled` BOOLEAN NOT NULL DEFAULT false,
    `onlineUrl` VARCHAR(500) NULL,
    `onlineDescription` TEXT NULL,
    `onlineNote` VARCHAR(200) NULL,
    `transferEnabled` BOOLEAN NOT NULL DEFAULT false,
    `beneficiary` VARCHAR(140) NULL,
    `iban` VARCHAR(34) NULL,
    `bic` VARCHAR(11) NULL,
    `transferReference` VARCHAR(140) NULL,
    `onsiteEnabled` BOOLEAN NOT NULL DEFAULT false,
    `checkPayee` VARCHAR(140) NULL,
    `onsiteText` TEXT NULL,
    `taxReceiptEnabled` BOOLEAN NOT NULL DEFAULT false,
    `taxReceiptText` TEXT NULL,
    `verseText` TEXT NULL,
    `verseReference` VARCHAR(80) NULL,
    `contactEmail` VARCHAR(254) NULL,
    `address` VARCHAR(255) NULL,
    `socialHandle` VARCHAR(80) NULL,
    `shortUrl` VARCHAR(255) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `giving_pages_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `giving_pages` ADD CONSTRAINT `giving_pages_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `giving_pages` ADD CONSTRAINT `giving_pages_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

