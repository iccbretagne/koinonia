-- CreateTable
CREATE TABLE `ticketing_events` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(200) NULL,
    `posterKey` VARCHAR(512) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `registrationDeadline` DATETIME(3) NULL,
    `capacity` INTEGER NOT NULL,
    `seatsOpen` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `paymentMethods` JSON NOT NULL,
    `optionPaymentDeadline` DATETIME(3) NULL,
    `reminderDaysBefore` INTEGER NOT NULL DEFAULT 3,
    `allowOnsitePayment` BOOLEAN NOT NULL DEFAULT false,
    `allowUnaccompaniedMinors` BOOLEAN NOT NULL DEFAULT false,
    `allowWalkIns` BOOLEAN NOT NULL DEFAULT false,
    `entryRefundable` BOOLEAN NOT NULL DEFAULT true,
    `entryRefundDeadline` DATETIME(3) NULL,
    `questions` JSON NOT NULL,
    `referencePrefix` VARCHAR(8) NOT NULL,
    `nextReference` INTEGER NOT NULL DEFAULT 1,
    `retentionDays` INTEGER NOT NULL DEFAULT 90,
    `capacityAlertLevel` INTEGER NOT NULL DEFAULT 0,
    `seatsAlertSent` BOOLEAN NOT NULL DEFAULT false,
    `closedAt` DATETIME(3) NULL,
    `purgedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ticketing_events_createdById_idx`(`createdById`),
    UNIQUE INDEX `ticketing_events_churchId_slug_key`(`churchId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_tariffs` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `ageGroup` ENUM('ADULT', 'TEEN', 'CHILD', 'INFANT') NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `ticketing_tariffs_eventId_ageGroup_key`(`eventId`, `ageGroup`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_options` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `type` ENUM('CHOICE', 'QUANTITY', 'CHECKBOX') NOT NULL,
    `scope` ENUM('PARTICIPANT', 'BOOKING') NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `stock` INTEGER NULL,
    `pickup` BOOLEAN NOT NULL DEFAULT false,
    `namedPrep` BOOLEAN NOT NULL DEFAULT false,
    `refundable` BOOLEAN NOT NULL DEFAULT true,
    `refundDeadline` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ticketing_options_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_variants` (
    `id` VARCHAR(191) NOT NULL,
    `optionId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `description` VARCHAR(300) NULL,
    `allergens` VARCHAR(200) NULL,
    `stock` INTEGER NULL,
    `prepared` INTEGER NULL,
    `closed` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ticketing_variants_optionId_idx`(`optionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_bookings` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(20) NOT NULL,
    `contactName` VARCHAR(150) NOT NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `contactPhone` VARCHAR(40) NULL,
    `userId` VARCHAR(191) NULL,
    `guardianName` VARCHAR(150) NULL,
    `guardianPhone` VARCHAR(40) NULL,
    `guardianConsentAt` DATETIME(3) NULL,
    `answers` JSON NOT NULL,
    `source` ENUM('ONLINE', 'ONSITE') NOT NULL DEFAULT 'ONLINE',
    `tokenSalt` VARCHAR(32) NOT NULL,
    `manageTokenHash` CHAR(64) NOT NULL,
    `scanTokenHash` CHAR(64) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `reminderSentAt` DATETIME(3) NULL,
    `dayBeforeSentAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ticketing_bookings_manageTokenHash_key`(`manageTokenHash`),
    UNIQUE INDEX `ticketing_bookings_scanTokenHash_key`(`scanTokenHash`),
    INDEX `ticketing_bookings_eventId_contactEmail_idx`(`eventId`, `contactEmail`),
    INDEX `ticketing_bookings_userId_idx`(`userId`),
    UNIQUE INDEX `ticketing_bookings_eventId_reference_key`(`eventId`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_participants` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `ageGroup` ENUM('ADULT', 'TEEN', 'CHILD', 'INFANT') NOT NULL,
    `ticketTokenHash` CHAR(64) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `entryPrice` DECIMAL(10, 2) NOT NULL,
    `entryStatus` ENUM('FREE', 'DUE', 'DECLARED', 'PAID', 'REFUND_DUE', 'REFUNDED', 'RELEASED', 'CANCELLED') NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ticketing_participants_ticketTokenHash_key`(`ticketTokenHash`),
    INDEX `ticketing_participants_bookingId_idx`(`bookingId`),
    INDEX `ticketing_participants_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_items` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NULL,
    `optionId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('FREE', 'DUE', 'DECLARED', 'PAID', 'REFUND_DUE', 'REFUNDED', 'RELEASED', 'CANCELLED') NOT NULL,
    `deliveredQty` INTEGER NOT NULL DEFAULT 0,
    `deliveredAt` DATETIME(3) NULL,
    `deliveredById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `labelVersion` INTEGER NOT NULL DEFAULT 1,
    `labelPrintedVersion` INTEGER NULL,
    `labelPrintedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ticketing_items_bookingId_idx`(`bookingId`),
    INDEX `ticketing_items_optionId_idx`(`optionId`),
    INDEX `ticketing_items_variantId_idx`(`variantId`),
    INDEX `ticketing_items_participantId_idx`(`participantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_payments` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DECLARATION', 'RECEIPT', 'REFUND') NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'REJECTED') NOT NULL,
    `method` ENUM('WERO', 'REVOLUT', 'TRANSFER', 'CASH', 'CHEQUE') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `chargeRefs` JSON NOT NULL,
    `reason` VARCHAR(300) NULL,
    `opId` VARCHAR(64) NULL,
    `recordedById` VARCHAR(191) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ticketing_payments_opId_key`(`opId`),
    INDEX `ticketing_payments_bookingId_idx`(`bookingId`),
    INDEX `ticketing_payments_eventId_kind_status_idx`(`eventId`, `kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_event_roles` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('ORGANIZER', 'TREASURER', 'RECEPTION', 'CATERING', 'OBSERVER') NOT NULL,

    INDEX `ticketing_event_roles_userId_idx`(`userId`),
    UNIQUE INDEX `ticketing_event_roles_eventId_userId_role_key`(`eventId`, `userId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_posts` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ticketing_posts_eventId_idx`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `guestName` VARCHAR(150) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `tokenSalt` VARCHAR(32) NOT NULL,
    `badgeTokenHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ticketing_assignments_badgeTokenHash_key`(`badgeTokenHash`),
    INDEX `ticketing_assignments_eventId_idx`(`eventId`),
    INDEX `ticketing_assignments_postId_idx`(`postId`),
    INDEX `ticketing_assignments_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_passages` (
    `id` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `subject` ENUM('PARTICIPANT', 'STAFF', 'MANUAL') NOT NULL,
    `participantId` VARCHAR(191) NULL,
    `assignmentId` VARCHAR(191) NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `delta` INTEGER NOT NULL DEFAULT 1,
    `reason` VARCHAR(200) NULL,
    `deviceId` VARCHAR(64) NOT NULL,
    `operatorId` VARCHAR(191) NULL,
    `gate` VARCHAR(60) NULL,
    `scannedAt` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `anomaly` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ticketing_passages_eventId_scannedAt_idx`(`eventId`, `scannedAt`),
    INDEX `ticketing_passages_participantId_idx`(`participantId`),
    INDEX `ticketing_passages_assignmentId_idx`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_onsite_sales` (
    `id` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `optionId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `method` ENUM('WERO', 'REVOLUT', 'TRANSFER', 'CASH', 'CHEQUE') NOT NULL,
    `soldById` VARCHAR(191) NULL,
    `soldAt` DATETIME(3) NOT NULL,

    INDEX `ticketing_onsite_sales_eventId_idx`(`eventId`),
    INDEX `ticketing_onsite_sales_optionId_idx`(`optionId`),
    INDEX `ticketing_onsite_sales_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ticketing_events` ADD CONSTRAINT `ticketing_events_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_events` ADD CONSTRAINT `ticketing_events_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_tariffs` ADD CONSTRAINT `ticketing_tariffs_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_options` ADD CONSTRAINT `ticketing_options_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_variants` ADD CONSTRAINT `ticketing_variants_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `ticketing_options`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_bookings` ADD CONSTRAINT `ticketing_bookings_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_bookings` ADD CONSTRAINT `ticketing_bookings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_participants` ADD CONSTRAINT `ticketing_participants_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `ticketing_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_participants` ADD CONSTRAINT `ticketing_participants_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_items` ADD CONSTRAINT `ticketing_items_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `ticketing_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_items` ADD CONSTRAINT `ticketing_items_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `ticketing_participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_items` ADD CONSTRAINT `ticketing_items_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `ticketing_options`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_items` ADD CONSTRAINT `ticketing_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ticketing_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_payments` ADD CONSTRAINT `ticketing_payments_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `ticketing_bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_payments` ADD CONSTRAINT `ticketing_payments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_event_roles` ADD CONSTRAINT `ticketing_event_roles_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_event_roles` ADD CONSTRAINT `ticketing_event_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_posts` ADD CONSTRAINT `ticketing_posts_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_assignments` ADD CONSTRAINT `ticketing_assignments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_assignments` ADD CONSTRAINT `ticketing_assignments_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ticketing_posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_assignments` ADD CONSTRAINT `ticketing_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_passages` ADD CONSTRAINT `ticketing_passages_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_passages` ADD CONSTRAINT `ticketing_passages_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `ticketing_participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_passages` ADD CONSTRAINT `ticketing_passages_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `ticketing_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_onsite_sales` ADD CONSTRAINT `ticketing_onsite_sales_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `ticketing_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_onsite_sales` ADD CONSTRAINT `ticketing_onsite_sales_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `ticketing_options`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticketing_onsite_sales` ADD CONSTRAINT `ticketing_onsite_sales_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ticketing_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

