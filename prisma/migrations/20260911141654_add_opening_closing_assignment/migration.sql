-- CreateTable
CREATE TABLE `opening_closing_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `slot` ENUM('OPENING', 'CLOSING') NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `opening_closing_assignments_churchId_idx`(`churchId`),
    INDEX `opening_closing_assignments_memberId_idx`(`memberId`),
    UNIQUE INDEX `opening_closing_assignments_eventId_slot_memberId_key`(`eventId`, `slot`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `opening_closing_assignments` ADD CONSTRAINT `opening_closing_assignments_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_closing_assignments` ADD CONSTRAINT `opening_closing_assignments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_closing_assignments` ADD CONSTRAINT `opening_closing_assignments_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opening_closing_assignments` ADD CONSTRAINT `opening_closing_assignments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
