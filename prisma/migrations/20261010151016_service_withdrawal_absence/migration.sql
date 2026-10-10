-- AlterTable
ALTER TABLE `service_withdrawals` ADD COLUMN `absenceId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `service_withdrawals_absenceId_status_idx` ON `service_withdrawals`(`absenceId`, `status`);

-- AddForeignKey
ALTER TABLE `service_withdrawals` ADD CONSTRAINT `service_withdrawals_absenceId_fkey` FOREIGN KEY (`absenceId`) REFERENCES `absences`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
