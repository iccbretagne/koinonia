-- Add secretariatEmail, reminderLastSentAt, planningDigestLastSentAt to churches
ALTER TABLE `churches` ADD COLUMN `secretariatEmail` VARCHAR(191) NULL;
ALTER TABLE `churches` ADD COLUMN `reminderLastSentAt` DATETIME(3) NULL;
ALTER TABLE `churches` ADD COLUMN `planningDigestLastSentAt` DATETIME(3) NULL;
