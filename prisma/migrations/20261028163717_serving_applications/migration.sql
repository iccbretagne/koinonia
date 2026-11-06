-- AlterTable
ALTER TABLE `departments` ADD COLUMN `contactEmail` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `serving_applications` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `status` ENUM('RECEIVED', 'VALIDATED', 'REJECTED') NOT NULL DEFAULT 'RECEIVED',
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `birthDate` DATE NOT NULL,
    `profession` VARCHAR(150) NULL,
    `maritalStatus` ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED') NULL,
    `childrenCount` INTEGER NULL,
    `street` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `postalCode` VARCHAR(20) NULL,
    `country` VARCHAR(100) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(200) NULL,
    `baptized` BOOLEAN NULL,
    `baptismDate` DATE NULL,
    `baptismPlace` VARCHAR(200) NULL,
    `previousChurch` BOOLEAN NULL,
    `previousChurchName` VARCHAR(200) NULL,
    `previousChurchLocation` VARCHAR(200) NULL,
    `pcncTrainings` JSON NOT NULL,
    `hasServed` BOOLEAN NULL,
    `servedDepartment` VARCHAR(200) NULL,
    `ministryService` VARCHAR(300) NULL,
    `communityService` VARCHAR(300) NULL,
    `otherRoles` VARCHAR(300) NULL,
    `availableToServe` BOOLEAN NULL,
    `interests` VARCHAR(500) NULL,
    `observations` TEXT NULL,
    `journeyDetails` TEXT NULL,
    `spiritualGoals` TEXT NULL,
    `specificDetails` TEXT NULL,
    `photoKey` VARCHAR(255) NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedById` VARCHAR(191) NULL,
    `rejectionReason` TEXT NULL,
    `purgeWarnedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serving_applications_churchId_status_createdAt_idx`(`churchId`, `status`, `createdAt`),
    INDEX `serving_applications_memberId_idx`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serving_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `applicationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'OBSERVATION', 'CONFIRMED', 'SENT_BACK') NOT NULL DEFAULT 'PENDING',
    `assignedById` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `acceptedById` VARCHAR(191) NULL,
    `observationEndsAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedById` VARCHAR(191) NULL,
    `sentBackReason` TEXT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `endingReminderAt` DATETIME(3) NULL,
    `overdueRemindedAt` DATETIME(3) NULL,

    INDEX `serving_assignments_departmentId_status_idx`(`departmentId`, `status`),
    INDEX `serving_assignments_applicationId_idx`(`applicationId`),
    INDEX `serving_assignments_status_observationEndsAt_idx`(`status`, `observationEndsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serving_settings` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `observationMonths` INTEGER NOT NULL DEFAULT 3,
    `retentionMonths` INTEGER NOT NULL DEFAULT 12,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `serving_settings_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `serving_applications` ADD CONSTRAINT `serving_applications_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_applications` ADD CONSTRAINT `serving_applications_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_assignments` ADD CONSTRAINT `serving_assignments_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `serving_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_assignments` ADD CONSTRAINT `serving_assignments_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serving_settings` ADD CONSTRAINT `serving_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
