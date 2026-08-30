-- CreateTable
CREATE TABLE `absence_backups` (
    `id` VARCHAR(191) NOT NULL,
    `absenceId` VARCHAR(191) NOT NULL,
    `type` ENUM('STAR', 'RESPONSIBLE') NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `userChurchRoleId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `absence_backups_absenceId_memberId_key`(`absenceId`, `memberId`),
    UNIQUE INDEX `absence_backups_absenceId_userChurchRoleId_key`(`absenceId`, `userChurchRoleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `media_share_tokens_token_idx` ON `media_share_tokens`(`token`);

-- AddForeignKey
ALTER TABLE `absence_backups` ADD CONSTRAINT `absence_backups_absenceId_fkey` FOREIGN KEY (`absenceId`) REFERENCES `absences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absence_backups` ADD CONSTRAINT `absence_backups_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absence_backups` ADD CONSTRAINT `absence_backups_userChurchRoleId_fkey` FOREIGN KEY (`userChurchRoleId`) REFERENCES `user_church_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
