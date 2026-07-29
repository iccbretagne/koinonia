-- DropForeignKey
ALTER TABLE `financial_requests` DROP FOREIGN KEY `financial_requests_departmentId_fkey`;

-- DropIndex
DROP INDEX `financial_requests_departmentId_fkey` ON `financial_requests`;

-- AlterTable
ALTER TABLE `job_seekers` MODIFY `description` TEXT NOT NULL;

-- CreateTable
CREATE TABLE `rooms` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NULL,
    `location` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rooms_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_accesses` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `room_accesses_roomId_churchId_key`(`roomId`, `churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `status` ENUM('CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    `recurrenceRule` VARCHAR(191) NULL,
    `seriesId` VARCHAR(191) NULL,
    `isRecurrenceParent` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelledAt` DATETIME(3) NULL,
    `cancelledById` VARCHAR(191) NULL,

    INDEX `room_reservations_roomId_startAt_endAt_idx`(`roomId`, `startAt`, `endAt`),
    INDEX `room_reservations_churchId_startAt_idx`(`churchId`, `startAt`),
    INDEX `room_reservations_seriesId_idx`(`seriesId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_checklists` (
    `id` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'OPENED', 'CLOSED_DECLARED', 'VALIDATED', 'ISSUE_REPORTED') NOT NULL DEFAULT 'PENDING',
    `openedById` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NULL,
    `keyReceivedFromId` VARCHAR(191) NULL,
    `keyReceivedFromName` VARCHAR(191) NULL,
    `openingNotes` TEXT NULL,
    `closedById` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `closedProperly` BOOLEAN NULL,
    `cleaned` BOOLEAN NULL,
    `keyReturnedToId` VARCHAR(191) NULL,
    `keyReturnedToName` VARCHAR(191) NULL,
    `closingNotes` TEXT NULL,
    `validatedById` VARCHAR(191) NULL,
    `validatedAt` DATETIME(3) NULL,
    `validatedClosedProperly` BOOLEAN NULL,
    `validatedCleaned` BOOLEAN NULL,
    `incidentNotes` TEXT NULL,

    UNIQUE INDEX `room_checklists_reservationId_key`(`reservationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `financial_requests` ADD CONSTRAINT `financial_requests_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_accesses` ADD CONSTRAINT `room_accesses_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_accesses` ADD CONSTRAINT `room_accesses_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_reservations` ADD CONSTRAINT `room_reservations_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_reservations` ADD CONSTRAINT `room_reservations_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_reservations` ADD CONSTRAINT `room_reservations_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_reservations` ADD CONSTRAINT `room_reservations_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_reservations` ADD CONSTRAINT `room_reservations_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `room_reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_openedById_fkey` FOREIGN KEY (`openedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_keyReceivedFromId_fkey` FOREIGN KEY (`keyReceivedFromId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_keyReturnedToId_fkey` FOREIGN KEY (`keyReturnedToId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_checklists` ADD CONSTRAINT `room_checklists_validatedById_fkey` FOREIGN KEY (`validatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
