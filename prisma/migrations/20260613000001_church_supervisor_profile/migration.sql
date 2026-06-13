-- Remplacement supervisorUserId (User) → supervisorProfileId (PastoralProfile)
ALTER TABLE `churches`
  DROP FOREIGN KEY  `churches_supervisorUserId_fkey`,
  DROP INDEX        `churches_supervisorUserId_idx`,
  DROP COLUMN       `supervisorUserId`,
  ADD COLUMN        `supervisorProfileId` VARCHAR(191) NULL,
  ADD INDEX         `churches_supervisorProfileId_idx` (`supervisorProfileId`),
  ADD CONSTRAINT    `churches_supervisorProfileId_fkey`
    FOREIGN KEY (`supervisorProfileId`) REFERENCES `pastoral_profiles` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
