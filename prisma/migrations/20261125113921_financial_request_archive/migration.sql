-- AlterTable
ALTER TABLE `financial_requests` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `archivedById` VARCHAR(191) NULL;
