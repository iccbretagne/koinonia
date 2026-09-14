-- AlterTable
ALTER TABLE `absences` ADD COLUMN `allDepartments` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `kind` ENUM('PERIOD', 'EVENTS') NOT NULL DEFAULT 'PERIOD',
    MODIFY `startDate` DATETIME(3) NULL,
    MODIFY `endDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `absence_departments` (
    `id` VARCHAR(191) NOT NULL,
    `absenceId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,

    INDEX `absence_departments_departmentId_idx`(`departmentId`),
    UNIQUE INDEX `absence_departments_absenceId_departmentId_key`(`absenceId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `absence_events` (
    `id` VARCHAR(191) NOT NULL,
    `absenceId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `eventTitle` VARCHAR(255) NOT NULL,
    `eventDate` DATETIME(3) NOT NULL,

    INDEX `absence_events_eventId_idx`(`eventId`),
    UNIQUE INDEX `absence_events_absenceId_eventId_key`(`absenceId`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `absence_departments` ADD CONSTRAINT `absence_departments_absenceId_fkey` FOREIGN KEY (`absenceId`) REFERENCES `absences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absence_departments` ADD CONSTRAINT `absence_departments_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absence_events` ADD CONSTRAINT `absence_events_absenceId_fkey` FOREIGN KEY (`absenceId`) REFERENCES `absences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absence_events` ADD CONSTRAINT `absence_events_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
