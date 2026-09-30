-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `entityId` VARCHAR(191) NULL,
    ADD COLUMN `entityType` VARCHAR(50) NULL;

-- CreateIndex
CREATE INDEX `notifications_entityType_entityId_idx` ON `notifications`(`entityType`, `entityId`);
