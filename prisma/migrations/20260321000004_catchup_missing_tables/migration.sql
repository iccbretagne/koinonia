-- Migration de rattrapage : tables et colonnes ajoutées via db push mais jamais capturées en migration
-- État production : announcements, announcement_events, service_requests, departments.function,
--                   events.allowAnnouncements EXISTENT déjà.
--                   Manquent : member_user_links, member_link_requests, discipleships,
--                              discipleship_attendances, events.trackedForDiscipleship

-- ─── Colonne manquante ──────────────────────────────────────────────────

ALTER TABLE `events`
  ADD COLUMN IF NOT EXISTS `trackedForDiscipleship` BOOLEAN NOT NULL DEFAULT false;

-- ─── Tables manquantes ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `member_user_links` (
  `id`            VARCHAR(191) NOT NULL,
  `memberId`      VARCHAR(191) NOT NULL,
  `userId`        VARCHAR(191) NOT NULL,
  `churchId`      VARCHAR(191) NOT NULL,
  `validatedAt`   DATETIME(3),
  `validatedById` VARCHAR(191),

  UNIQUE INDEX `member_user_links_memberId_key`(`memberId`),
  UNIQUE INDEX `member_user_links_userId_churchId_key`(`userId`, `churchId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `member_link_requests` (
  `id`           VARCHAR(191) NOT NULL,
  `userId`       VARCHAR(191) NOT NULL,
  `memberId`     VARCHAR(191),
  `firstName`    VARCHAR(191),
  `lastName`     VARCHAR(191),
  `phone`        VARCHAR(191),
  `churchId`     VARCHAR(191) NOT NULL,
  `status`       ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `rejectReason` VARCHAR(191),
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt`   DATETIME(3),
  `reviewedById` VARCHAR(191),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `discipleships` (
  `id`              VARCHAR(191) NOT NULL,
  `discipleId`      VARCHAR(191) NOT NULL,
  `discipleMakerId` VARCHAR(191) NOT NULL,
  `firstMakerId`    VARCHAR(191) NOT NULL,
  `churchId`        VARCHAR(191) NOT NULL,
  `startedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `discipleships_discipleId_churchId_key`(`discipleId`, `churchId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `discipleship_attendances` (
  `id`       VARCHAR(191) NOT NULL,
  `memberId` VARCHAR(191) NOT NULL,
  `eventId`  VARCHAR(191) NOT NULL,
  `present`  BOOLEAN NOT NULL DEFAULT true,

  UNIQUE INDEX `discipleship_attendances_memberId_eventId_key`(`memberId`, `eventId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── Foreign Keys (uniquement pour les nouvelles tables) ────────────────

-- member_user_links
ALTER TABLE `member_user_links`
  ADD CONSTRAINT `member_user_links_memberId_fkey`      FOREIGN KEY (`memberId`)      REFERENCES `members`(`id`)   ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `member_user_links_userId_fkey`        FOREIGN KEY (`userId`)        REFERENCES `users`(`id`)     ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `member_user_links_churchId_fkey`      FOREIGN KEY (`churchId`)      REFERENCES `churches`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `member_user_links_validatedById_fkey` FOREIGN KEY (`validatedById`) REFERENCES `users`(`id`)     ON DELETE SET NULL ON UPDATE CASCADE;

-- member_link_requests
ALTER TABLE `member_link_requests`
  ADD CONSTRAINT `member_link_requests_userId_fkey`       FOREIGN KEY (`userId`)       REFERENCES `users`(`id`)    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `member_link_requests_memberId_fkey`     FOREIGN KEY (`memberId`)     REFERENCES `members`(`id`)  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `member_link_requests_churchId_fkey`     FOREIGN KEY (`churchId`)     REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `member_link_requests_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`)    ON DELETE SET NULL ON UPDATE CASCADE;

-- discipleships
ALTER TABLE `discipleships`
  ADD CONSTRAINT `discipleships_discipleId_fkey`      FOREIGN KEY (`discipleId`)      REFERENCES `members`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `discipleships_discipleMakerId_fkey` FOREIGN KEY (`discipleMakerId`) REFERENCES `members`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `discipleships_firstMakerId_fkey`    FOREIGN KEY (`firstMakerId`)    REFERENCES `members`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `discipleships_churchId_fkey`        FOREIGN KEY (`churchId`)        REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- discipleship_attendances
ALTER TABLE `discipleship_attendances`
  ADD CONSTRAINT `discipleship_attendances_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `discipleship_attendances_eventId_fkey`  FOREIGN KEY (`eventId`)  REFERENCES `events`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE;
