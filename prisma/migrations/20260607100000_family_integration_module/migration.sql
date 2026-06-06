-- CreateEnum
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id` VARCHAR(36) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `finished_at` DATETIME(3),
  `migration_name` VARCHAR(255) NOT NULL,
  `logs` TEXT,
  `rolled_back_at` DATETIME(3),
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CreateTable: family_integration_requests
CREATE TABLE `family_integration_requests` (
  `id` VARCHAR(191) NOT NULL,
  `churchId` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(100) NOT NULL,
  `lastName` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255),
  `phone` VARCHAR(30),
  `address` VARCHAR(500),
  `city` VARCHAR(100),
  `lat` DOUBLE,
  `lng` DOUBLE,
  `ageRange` ENUM('YOUTH','YOUNG_ADULT','ADULT','SENIOR') NOT NULL,
  `churchStatus` ENUM('VISITOR','REGULAR','ENGAGED') NOT NULL DEFAULT 'VISITOR',
  `memberId` VARCHAR(191),
  `pastoralCareRequested` BOOLEAN NOT NULL DEFAULT false,
  `appointmentRequestId` VARCHAR(191),
  `suggestedFamilyId` INT,
  `suggestedFamilyName` VARCHAR(100),
  `assignedFamilyId` INT,
  `assignedFamilyName` VARCHAR(100),
  `assignedBergerId` VARCHAR(191),
  `status` ENUM('SUBMITTED','ASSIGNED','CONTACTED','WHATSAPP_ADDED','INTEGRATED','ABANDONED') NOT NULL DEFAULT 'SUBMITTED',
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `assignedAt` DATETIME(3),
  `contactedAt` DATETIME(3),
  `whatsappAddedAt` DATETIME(3),
  `integratedAt` DATETIME(3),
  `abandonedAt` DATETIME(3),
  `abandonReason` VARCHAR(500),
  `notes` TEXT,
  `archivedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE KEY `family_integration_requests_appointmentRequestId_key` (`appointmentRequestId`),
  INDEX `family_integration_requests_churchId_status_idx` (`churchId`, `status`),
  INDEX `family_integration_requests_churchId_assignedFamilyId_idx` (`churchId`, `assignedFamilyId`),
  INDEX `family_integration_requests_churchId_submittedAt_idx` (`churchId`, `submittedAt`),
  INDEX `family_integration_requests_assignedBergerId_idx` (`assignedBergerId`),
  INDEX `family_integration_requests_memberId_idx` (`memberId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: family_leader_assignments
CREATE TABLE `family_leader_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `churchId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `familyId` INT NOT NULL,
  `familyName` VARCHAR(100) NOT NULL,
  `role` ENUM('BERGER','CO_BERGER') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE KEY `family_leader_assignments_churchId_userId_familyId_key` (`churchId`, `userId`, `familyId`),
  INDEX `family_leader_assignments_churchId_familyId_idx` (`churchId`, `familyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `family_integration_requests`
  ADD CONSTRAINT `family_integration_requests_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `family_integration_requests`
  ADD CONSTRAINT `family_integration_requests_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `family_integration_requests`
  ADD CONSTRAINT `family_integration_requests_appointmentRequestId_fkey` FOREIGN KEY (`appointmentRequestId`) REFERENCES `appointment_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `family_integration_requests`
  ADD CONSTRAINT `family_integration_requests_assignedBergerId_fkey` FOREIGN KEY (`assignedBergerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `family_leader_assignments`
  ADD CONSTRAINT `family_leader_assignments_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `family_leader_assignments`
  ADD CONSTRAINT `family_leader_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
