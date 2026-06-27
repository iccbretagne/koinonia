-- departmentId becomes nullable to allow personal expense reports (no department)
ALTER TABLE `financial_requests` MODIFY COLUMN `departmentId` VARCHAR(191) NULL;
