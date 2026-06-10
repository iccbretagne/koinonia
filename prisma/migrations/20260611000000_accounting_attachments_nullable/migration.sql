-- Make requestId nullable on financial_attachments (pre-upload before request creation)
-- Drop FK constraint first, then modify column, then re-add as nullable FK

ALTER TABLE `financial_attachments`
  DROP FOREIGN KEY IF EXISTS `financial_attachments_requestId_fkey`;

ALTER TABLE `financial_attachments`
  MODIFY COLUMN `requestId` VARCHAR(191) NULL,
  ADD COLUMN `uploadedById` VARCHAR(191) NULL;

ALTER TABLE `financial_attachments`
  ADD CONSTRAINT `financial_attachments_requestId_fkey`
    FOREIGN KEY (`requestId`) REFERENCES `financial_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `financial_attachments_uploadedById_fkey`
    FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
