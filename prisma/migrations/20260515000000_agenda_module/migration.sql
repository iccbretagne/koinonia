-- Module agenda — fondation
-- Ajoute le rôle AGENDA_QUALIFIER et les 3 modèles du module agenda

-- AlterEnum: ajout de AGENDA_QUALIFIER
ALTER TABLE `user_church_roles` MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SECRETARY', 'MINISTER', 'DEPARTMENT_HEAD', 'DISCIPLE_MAKER', 'REPORTER', 'STAR', 'AGENDA_QUALIFIER') NOT NULL;

-- CreateTable: pastoral_profiles
CREATE TABLE `pastoral_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `role` ENUM('PASTEUR', 'ASSISTANT_PASTEUR', 'BERGER') NOT NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: appointment_requests
CREATE TABLE `appointment_requests` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `preferredDays` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'VALIDATED', 'SCHEDULED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `assignedToId` VARCHAR(191) NULL,
    `qualifiedById` VARCHAR(191) NULL,
    `qualifiedAt` DATETIME(3) NULL,
    `qualificationNote` VARCHAR(191) NULL,
    `rejectReason` VARCHAR(191) NULL,
    `scheduledById` VARCHAR(191) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: agenda_entries
CREATE TABLE `agenda_entries` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `type` ENUM('ACTIVITY', 'APPOINTMENT') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `location` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agenda_entries_requestId_key`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: pastoral_profiles → churches
ALTER TABLE `pastoral_profiles` ADD CONSTRAINT `pastoral_profiles_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: pastoral_profiles → users
ALTER TABLE `pastoral_profiles` ADD CONSTRAINT `pastoral_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointment_requests → churches
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: appointment_requests → users (demandeur)
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointment_requests → pastoral_profiles (assigné)
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `pastoral_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointment_requests → users (qualificateur)
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_qualifiedById_fkey` FOREIGN KEY (`qualifiedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: appointment_requests → users (planificateur)
ALTER TABLE `appointment_requests` ADD CONSTRAINT `appointment_requests_scheduledById_fkey` FOREIGN KEY (`scheduledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: agenda_entries → churches
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: agenda_entries → pastoral_profiles (destinataire)
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `pastoral_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: agenda_entries → appointment_requests
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `appointment_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: agenda_entries → users (créateur)
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
