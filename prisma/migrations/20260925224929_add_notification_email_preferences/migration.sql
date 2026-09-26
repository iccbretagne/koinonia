-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `domain` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `notification_email_preferences` (
    `userId` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`, `domain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `notifications_userId_domain_idx` ON `notifications`(`userId`, `domain`);

-- AddForeignKey
ALTER TABLE `notification_email_preferences` ADD CONSTRAINT `notification_email_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Spec 053 — rattache chaque notification existante à un domaine, par préfixe de son `type`.
--
-- Sert uniquement à la règle d'affichage de la page « Mes notifications » (« ce domaine
-- concerne cet utilisateur, il a déjà reçu une notification de ce type ») : aucune ligne de
-- préférence n'est créée ici, les valeurs par défaut par domaine restent dans le code
-- (`NotificationDomainDescriptor.defaultEmail`, `src/core/module-registry.ts`).
--
-- Mapping vérifié contre tous les points d'émission du code (préfixes de `type` constants ou
-- construits dynamiquement, ex. `MEDIA_FILE_${status}`, `ACCOUNTING_${status}`) : chaque module
-- préfixe ses types de façon cohérente, d'où des motifs `LIKE` plutôt qu'une énumération.
UPDATE `notifications`
SET `domain` = CASE
  WHEN `type` LIKE 'PLANNING_%' OR `type` LIKE 'ABSENCE_%' OR `type` LIKE 'OPENING_CLOSING_%'
    THEN 'planning'
  WHEN `type` IN ('REQUEST_SUBMITTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'ANNOUNCEMENT_SHEET_DEPOSITED')
    THEN 'requests'
  WHEN `type` LIKE 'CARE_%'
    THEN 'care'
  WHEN `type` LIKE 'INTEGRATION_%'
    THEN 'integration'
  WHEN `type` LIKE 'ACCOUNTING_%'
    THEN 'accounting'
  WHEN `type` LIKE 'ROOM_%'
    THEN 'rooms'
  WHEN `type` LIKE 'MEDIA_FILE_%'
    THEN 'media'
  WHEN `type` IN ('ROLE_ASSIGNED', 'MEMBER_LINK_REQUEST', 'MEMBER_LINK_APPROVED', 'MEMBER_LINK_REJECTED')
    THEN 'account'
  WHEN `type` IN ('JOB_OFFER', 'JOB_OFFER_RENEWAL', 'JOB_SEEKER', 'FREELANCE_MISSION', 'FREELANCE_PROFILE')
    THEN 'jobs'
  ELSE NULL
END
WHERE `domain` IS NULL;
