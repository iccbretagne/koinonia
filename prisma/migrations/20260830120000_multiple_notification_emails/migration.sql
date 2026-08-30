-- AlterTable: emails multiples pour comptabilité et secrétariat (spec 033)
-- Migration écrite à la main (add + copy + drop) plutôt que laissée à la détection
-- automatique de renommage de `prisma migrate dev`, pour garantir la préservation des
-- adresses déjà configurées.
ALTER TABLE `churches` ADD COLUMN `secretariatEmails` TEXT NULL;
ALTER TABLE `churches` ADD COLUMN `accountingEmails` TEXT NULL;

UPDATE `churches` SET `secretariatEmails` = `secretariatEmail` WHERE `secretariatEmail` IS NOT NULL;
UPDATE `churches` SET `accountingEmails` = `accountingEmail` WHERE `accountingEmail` IS NOT NULL;

ALTER TABLE `churches` DROP COLUMN `secretariatEmail`;
ALTER TABLE `churches` DROP COLUMN `accountingEmail`;
