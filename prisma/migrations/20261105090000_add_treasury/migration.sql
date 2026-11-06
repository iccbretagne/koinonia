-- AlterTable
ALTER TABLE `financial_payments` ADD COLUMN `treasuryAccountId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `shuttle_entries` ADD COLUMN `treasuryAccountId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `treasury_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `kind` ENUM('CASH', 'ONLINE', 'OTHER') NOT NULL,
    `openingBalance` DECIMAL(12, 2) NOT NULL,
    `openingDate` DATE NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `treasury_accounts_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_categories` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `system` ENUM('SPECIAL_OFFERING', 'DEPOSIT', 'EXPENSE_REPORTS', 'SHUTTLE') NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `treasury_categories_churchId_direction_name_key`(`churchId`, `direction`, `name`),
    UNIQUE INDEX `treasury_categories_churchId_system_key`(`churchId`, `system`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_purposes` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `treasury_purposes_churchId_name_key`(`churchId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_entries` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `kind` ENUM('STANDARD', 'TRANSFER', 'DEPOSIT') NOT NULL DEFAULT 'STANDARD',
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `purposeId` VARCHAR(191) NULL,
    `method` ENUM('CASH', 'CHEQUE', 'TRANSFER', 'CARD', 'ONLINE', 'WERO', 'OTHER') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `date` DATE NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `thirdParty` VARCHAR(120) NULL,
    `collectionId` VARCHAR(191) NULL,
    `transferGroupId` VARCHAR(40) NULL,
    `depositRef` VARCHAR(60) NULL,
    `receiptKey` VARCHAR(512) NULL,
    `receiptName` VARCHAR(255) NULL,
    `receiptMime` VARCHAR(100) NULL,
    `receiptSize` INTEGER NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `treasury_entries_churchId_deletedAt_date_idx`(`churchId`, `deletedAt`, `date`),
    INDEX `treasury_entries_accountId_deletedAt_date_idx`(`accountId`, `deletedAt`, `date`),
    INDEX `treasury_entries_transferGroupId_idx`(`transferGroupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_collections` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `counter1` VARCHAR(80) NOT NULL,
    `counter2` VARCHAR(80) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `treasury_collections_churchId_date_idx`(`churchId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_cheques` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `depositEntryId` VARCHAR(191) NULL,

    INDEX `treasury_cheques_churchId_depositEntryId_idx`(`churchId`, `depositEntryId`),
    INDEX `treasury_cheques_entryId_idx`(`entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_closures` (
    `churchId` VARCHAR(191) NOT NULL,
    `month` CHAR(7) NOT NULL,
    `closedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedById` VARCHAR(191) NULL,

    PRIMARY KEY (`churchId`, `month`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasury_budgets` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,

    UNIQUE INDEX `treasury_budgets_churchId_year_categoryId_month_key`(`churchId`, `year`, `categoryId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `financial_payments_treasuryAccountId_idx` ON `financial_payments`(`treasuryAccountId`);

-- AddForeignKey
ALTER TABLE `financial_payments` ADD CONSTRAINT `financial_payments_treasuryAccountId_fkey` FOREIGN KEY (`treasuryAccountId`) REFERENCES `treasury_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shuttle_entries` ADD CONSTRAINT `shuttle_entries_treasuryAccountId_fkey` FOREIGN KEY (`treasuryAccountId`) REFERENCES `treasury_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_accounts` ADD CONSTRAINT `treasury_accounts_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_categories` ADD CONSTRAINT `treasury_categories_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_purposes` ADD CONSTRAINT `treasury_purposes_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_entries` ADD CONSTRAINT `treasury_entries_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_entries` ADD CONSTRAINT `treasury_entries_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `treasury_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_entries` ADD CONSTRAINT `treasury_entries_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `treasury_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_entries` ADD CONSTRAINT `treasury_entries_purposeId_fkey` FOREIGN KEY (`purposeId`) REFERENCES `treasury_purposes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_entries` ADD CONSTRAINT `treasury_entries_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `treasury_collections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_collections` ADD CONSTRAINT `treasury_collections_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_collections` ADD CONSTRAINT `treasury_collections_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `treasury_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_collections` ADD CONSTRAINT `treasury_collections_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_cheques` ADD CONSTRAINT `treasury_cheques_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_cheques` ADD CONSTRAINT `treasury_cheques_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `treasury_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_cheques` ADD CONSTRAINT `treasury_cheques_depositEntryId_fkey` FOREIGN KEY (`depositEntryId`) REFERENCES `treasury_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_closures` ADD CONSTRAINT `treasury_closures_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_budgets` ADD CONSTRAINT `treasury_budgets_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasury_budgets` ADD CONSTRAINT `treasury_budgets_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `treasury_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

