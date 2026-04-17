-- Migration: tenant-scope-media-settings
-- Rend MediaSettings multi-tenant en ajoutant churchId comme clé unique.
-- Supprime la ligne globale id="default" et lie chaque ligne à une église.

-- 1. Supprimer les données globales existantes (ligne "default")
DELETE FROM `media_settings` WHERE `id` = 'default';

-- 2. Modifier la colonne id pour utiliser cuid() au lieu de "default"
ALTER TABLE `media_settings`
  MODIFY `id` VARCHAR(191) NOT NULL;

-- 3. Ajouter la colonne churchId
ALTER TABLE `media_settings`
  ADD COLUMN `churchId` VARCHAR(191) NOT NULL;

-- 4. Ajouter la contrainte UNIQUE sur churchId
ALTER TABLE `media_settings`
  ADD CONSTRAINT `media_settings_churchId_key` UNIQUE (`churchId`);

-- 5. Ajouter la clé étrangère vers churches
ALTER TABLE `media_settings`
  ADD CONSTRAINT `media_settings_churchId_fkey`
  FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
