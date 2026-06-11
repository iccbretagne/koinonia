-- CreateTable
CREATE TABLE `welcome_duty_families` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `familyId` INTEGER NOT NULL,
    `familyName` VARCHAR(100) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `welcome_duty_families_churchId_familyId_key`(`churchId`, `familyId`),
    INDEX `welcome_duty_families_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welcome_duty_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `welcomeDutyFamilyId` VARCHAR(191) NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `welcome_duty_assignments_eventId_welcomeDutyFamilyId_key`(`eventId`, `welcomeDutyFamilyId`),
    INDEX `welcome_duty_assignments_churchId_idx`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `welcome_duty_families` ADD CONSTRAINT `welcome_duty_families_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welcome_duty_assignments` ADD CONSTRAINT `welcome_duty_assignments_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welcome_duty_assignments` ADD CONSTRAINT `welcome_duty_assignments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `welcome_duty_assignments` ADD CONSTRAINT `welcome_duty_assignments_welcomeDutyFamilyId_fkey` FOREIGN KEY (`welcomeDutyFamilyId`) REFERENCES `welcome_duty_families`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
