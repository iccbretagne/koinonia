-- Migration: onboarding enrichi
-- Ajout des champs de rôle, département, ministère et notes sur MemberLinkRequest

ALTER TABLE `member_link_requests`
  ADD COLUMN `departmentId`  VARCHAR(191) NULL,
  ADD COLUMN `ministryId`    VARCHAR(191) NULL,
  ADD COLUMN `requestedRole` VARCHAR(191) NULL,
  ADD COLUMN `notes`         TEXT         NULL;

ALTER TABLE `member_link_requests`
  ADD CONSTRAINT `member_link_requests_departmentId_fkey`
    FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `member_link_requests`
  ADD CONSTRAINT `member_link_requests_ministryId_fkey`
    FOREIGN KEY (`ministryId`) REFERENCES `ministries`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
