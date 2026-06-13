-- AlterTable: ajoute responsable et superviseur pastoral sur Church
ALTER TABLE `churches`
  ADD COLUMN `responsibleProfileId` VARCHAR(191) NULL,
  ADD COLUMN `supervisorUserId`     VARCHAR(191) NULL,
  ADD UNIQUE INDEX `churches_responsibleProfileId_key` (`responsibleProfileId`),
  ADD INDEX  `churches_supervisorUserId_idx`  (`supervisorUserId`),
  ADD CONSTRAINT `churches_responsibleProfileId_fkey`
    FOREIGN KEY (`responsibleProfileId`) REFERENCES `pastoral_profiles` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `churches_supervisorUserId_fkey`
    FOREIGN KEY (`supervisorUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
