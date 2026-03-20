-- AlterTable: add isSystem to ministries
ALTER TABLE `ministries` ADD COLUMN `isSystem` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add isSystem to departments
ALTER TABLE `departments` ADD COLUMN `isSystem` BOOLEAN NOT NULL DEFAULT false;

-- Insert system ministry + department for each existing church
INSERT INTO `ministries` (`id`, `name`, `churchId`, `isSystem`, `createdAt`)
SELECT
  CONCAT('sys-min-', `id`),
  'Système',
  `id`,
  true,
  NOW()
FROM `churches`;

INSERT INTO `departments` (`id`, `name`, `ministryId`, `isSystem`, `createdAt`)
SELECT
  CONCAT('sys-dept-', c.`id`),
  'Sans département',
  CONCAT('sys-min-', c.`id`),
  true,
  NOW()
FROM `churches` c;
