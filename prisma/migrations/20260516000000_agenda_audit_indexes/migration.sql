-- T06: champs updatedById pour la traçabilité des modifications
ALTER TABLE `appointment_requests` ADD COLUMN `updatedById` VARCHAR(191) NULL;
ALTER TABLE `agenda_entries` ADD COLUMN `updatedById` VARCHAR(191) NULL;

-- T06: contraintes de clé étrangère
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- T08: index de performance
CREATE INDEX `appointment_requests_churchId_status_createdAt_idx`
  ON `appointment_requests`(`churchId`, `status`, `createdAt`);

CREATE INDEX `agenda_entries_churchId_recipientId_startsAt_idx`
  ON `agenda_entries`(`churchId`, `recipientId`, `startsAt`);

CREATE INDEX `agenda_entries_churchId_startsAt_idx`
  ON `agenda_entries`(`churchId`, `startsAt`);
