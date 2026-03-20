-- AlterTable: add report flags to events
ALTER TABLE `events`
  ADD COLUMN `reportEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `statsEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: event_reports
CREATE TABLE `event_reports` (
  `id`        VARCHAR(191) NOT NULL,
  `eventId`   VARCHAR(191) NOT NULL,
  `churchId`  VARCHAR(191) NOT NULL,
  `notes`     TEXT,
  `decisions` TEXT,
  `authorId`  VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `event_reports_eventId_key`(`eventId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: event_report_sections
CREATE TABLE `event_report_sections` (
  `id`           VARCHAR(191) NOT NULL,
  `reportId`     VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191),
  `label`        VARCHAR(191) NOT NULL,
  `position`     INTEGER NOT NULL DEFAULT 0,
  `present`      INTEGER,
  `absent`       INTEGER,
  `newcomers`    INTEGER,
  `notes`        TEXT,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `event_reports`
  ADD CONSTRAINT `event_reports_eventId_fkey`  FOREIGN KEY (`eventId`)  REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `event_reports_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `event_reports_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_report_sections`
  ADD CONSTRAINT `event_report_sections_reportId_fkey`     FOREIGN KEY (`reportId`)     REFERENCES `event_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `event_report_sections_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
