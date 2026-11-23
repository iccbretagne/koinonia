-- AlterTable
ALTER TABLE `ticketing_events` ADD COLUMN `address` VARCHAR(300) NULL,
    ADD COLUMN `ticketVisualDraft` JSON NULL,
    ADD COLUMN `ticketVisualPublished` JSON NULL;

-- CreateTable
CREATE TABLE `ticketing_ticket_images` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `data` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ticketing_ticket_images_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ticketing_ticket_images` ADD CONSTRAINT `ticketing_ticket_images_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
