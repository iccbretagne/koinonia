-- AlterTable
ALTER TABLE `media_share_tokens` ADD COLUMN `churchId` VARCHAR(191) NULL;

-- Backfill (spec 049) : un lien d'événement ou de projet hérite de l'église de sa source.
UPDATE `media_share_tokens` t
JOIN `media_events` e ON e.`id` = t.`mediaEventId`
SET t.`churchId` = e.`churchId`
WHERE t.`mediaEventId` IS NOT NULL;

UPDATE `media_share_tokens` t
JOIN `media_projects` p ON p.`id` = t.`mediaProjectId`
SET t.`churchId` = p.`churchId`
WHERE t.`mediaProjectId` IS NOT NULL;

-- Backfill des collections multi-sources (ni événement ni projet direct) : église de la
-- première source listée dans `config` (événement, sinon projet). Une collection dont toutes
-- les sources ont été supprimées entre-temps reste à `churchId` NULL — invisible dans la liste
-- des partages actifs, mais toujours fonctionnelle pour son destinataire.
UPDATE `media_share_tokens` t
JOIN `media_events` e ON e.`id` = JSON_UNQUOTE(JSON_EXTRACT(t.`config`, '$.eventIds[0]'))
SET t.`churchId` = e.`churchId`
WHERE t.`mediaEventId` IS NULL
  AND t.`mediaProjectId` IS NULL
  AND t.`churchId` IS NULL
  AND JSON_EXTRACT(t.`config`, '$.eventIds[0]') IS NOT NULL;

UPDATE `media_share_tokens` t
JOIN `media_projects` p ON p.`id` = JSON_UNQUOTE(JSON_EXTRACT(t.`config`, '$.projectIds[0]'))
SET t.`churchId` = p.`churchId`
WHERE t.`mediaEventId` IS NULL
  AND t.`mediaProjectId` IS NULL
  AND t.`churchId` IS NULL
  AND JSON_EXTRACT(t.`config`, '$.projectIds[0]') IS NOT NULL;

-- CreateIndex
CREATE INDEX `media_share_tokens_churchId_idx` ON `media_share_tokens`(`churchId`);

-- AddForeignKey
ALTER TABLE `media_share_tokens` ADD CONSTRAINT `media_share_tokens_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
