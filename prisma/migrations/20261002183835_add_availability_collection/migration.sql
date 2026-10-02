-- CreateTable
CREATE TABLE `availability_settings` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `openMonthsBefore` INTEGER NOT NULL DEFAULT 2,
    `closeDaysBefore` INTEGER NOT NULL DEFAULT 7,
    `relanceDaysBefore` INTEGER NOT NULL DEFAULT 3,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `availability_settings_churchId_key`(`churchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availability_collections` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closesAt` DATETIME(3) NOT NULL,
    `notifiedAt` DATETIME(3) NULL,
    `relanceSentAt` DATETIME(3) NULL,

    UNIQUE INDEX `availability_collections_churchId_month_key`(`churchId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availability_responses` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `answer` ENUM('AVAILABLE', 'IF_NEEDED', 'UNAVAILABLE') NOT NULL,
    `enteredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `availability_responses_eventId_departmentId_idx`(`eventId`, `departmentId`),
    UNIQUE INDEX `availability_responses_memberId_eventId_departmentId_key`(`memberId`, `eventId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availability_asks` (
    `id` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `reason` ENUM('EVENT_ADDED', 'EVENT_MOVED', 'LEADER') NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `relanceSentAt` DATETIME(3) NULL,
    `manualRelanceAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `availability_asks_eventId_departmentId_key`(`eventId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availability_reminder_logs` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `sentOn` DATE NOT NULL,

    UNIQUE INDEX `availability_reminder_logs_memberId_eventId_sentOn_key`(`memberId`, `eventId`, `sentOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `availability_settings` ADD CONSTRAINT `availability_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_collections` ADD CONSTRAINT `availability_collections_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_responses` ADD CONSTRAINT `availability_responses_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_responses` ADD CONSTRAINT `availability_responses_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_responses` ADD CONSTRAINT `availability_responses_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_responses` ADD CONSTRAINT `availability_responses_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_responses` ADD CONSTRAINT `availability_responses_enteredById_fkey` FOREIGN KEY (`enteredById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_asks` ADD CONSTRAINT `availability_asks_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_asks` ADD CONSTRAINT `availability_asks_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availability_asks` ADD CONSTRAINT `availability_asks_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Reprise de l'existant (spec 058, ADR-0020) ──────────────────────────────

-- (a) Absences « par événements » actives -> une réponse « Pas disponible » par événement existant
--     x département du membre qui sert l'événement (tous les départements si allDepartments,
--     sinon ceux ciblés par l'absence).
INSERT IGNORE INTO `availability_responses`
  (`id`, `churchId`, `memberId`, `eventId`, `departmentId`, `answer`, `enteredById`, `updatedAt`)
SELECT UUID(), a.`churchId`, a.`memberId`, ae.`eventId`, ed.`departmentId`, 'UNAVAILABLE', a.`createdById`, NOW(3)
FROM `absences` a
JOIN `absence_events` ae ON ae.`absenceId` = a.`id` AND ae.`eventId` IS NOT NULL
JOIN `event_departments` ed ON ed.`eventId` = ae.`eventId`
JOIN `member_departments` md ON md.`memberId` = a.`memberId` AND md.`departmentId` = ed.`departmentId`
WHERE a.`kind` = 'EVENTS' AND a.`status` = 'ACTIVE'
  AND (a.`allDepartments` = 1
       OR EXISTS (SELECT 1 FROM `absence_departments` ad
                  WHERE ad.`absenceId` = a.`id` AND ad.`departmentId` = ed.`departmentId`));

-- (b) Les absences « par événements » (actives ou annulées) disparaissent ; le journal d'audit
--     garde la trace de leur déclaration. Les cibles et backups partent en cascade.
DELETE FROM `absences` WHERE `kind` = 'EVENTS';

-- (c) Statut de service « Indisponible » posé à la main -> réponse « Pas disponible » (reprise :
--     sans auteur). Une réponse déjà donnée par le STAR est conservée.
INSERT IGNORE INTO `availability_responses`
  (`id`, `churchId`, `memberId`, `eventId`, `departmentId`, `answer`, `enteredById`, `updatedAt`)
SELECT UUID(), e.`churchId`, p.`memberId`, ed.`eventId`, ed.`departmentId`, 'UNAVAILABLE', NULL, NOW(3)
FROM `plannings` p
JOIN `event_departments` ed ON ed.`id` = p.`eventDepartmentId`
JOIN `events` e ON e.`id` = ed.`eventId`
WHERE p.`status` = 'INDISPONIBLE';

-- (d) Le STAR sort du planning de l'événement.
DELETE FROM `plannings` WHERE `status` = 'INDISPONIBLE';
