-- AlterTable
ALTER TABLE `job_offers` ADD COLUMN `renewalRequestedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `job_offers_status_renewalRequestedAt_idx` ON `job_offers`(`status`, `renewalRequestedAt`);
