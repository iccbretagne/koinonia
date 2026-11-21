-- AlterTable
ALTER TABLE `ticketing_site_assets` ADD COLUMN `alt` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `name` VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN `variants` JSON NULL;

