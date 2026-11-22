-- AlterTable
ALTER TABLE `financial_requests` ADD COLUMN `pieceRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `pieceRequestLastAt` DATETIME(3) NULL,
    ADD COLUMN `pieceRequestCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pieceRequestNote` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `shuttle_entries` ADD COLUMN `receiptRequestedAt` DATETIME(3) NULL,
    ADD COLUMN `receiptRequestLastAt` DATETIME(3) NULL,
    ADD COLUMN `receiptRequestCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `receiptRequestNote` VARCHAR(500) NULL;

-- CreateIndex
CREATE INDEX `financial_requests_churchId_pieceRequestedAt_idx` ON `financial_requests`(`churchId`, `pieceRequestedAt`);
