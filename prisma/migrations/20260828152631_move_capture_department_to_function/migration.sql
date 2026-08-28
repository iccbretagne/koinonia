/*
  Warnings:

  - You are about to drop the column `captureDepartmentId` on the `audio_settings` table. All the data in the column will be lost.

  Spec 021 : le département de captation rejoint le mécanisme commun des fonctions de
  département (`departments.function`), plutôt que sa propre colonne sur `audio_settings`.
  Le report de données précède la suppression pour ne perdre aucune configuration existante.
*/

-- ReportData : reporter la configuration existante avant de la supprimer
UPDATE `departments` d
JOIN `audio_settings` s ON s.`captureDepartmentId` = d.`id`
SET d.`function` = 'CAPTATION_AUDIO';

-- DropForeignKey
ALTER TABLE `audio_settings` DROP FOREIGN KEY `audio_settings_captureDepartmentId_fkey`;

-- DropIndex
DROP INDEX `audio_settings_captureDepartmentId_fkey` ON `audio_settings`;

-- AlterTable
ALTER TABLE `audio_settings` DROP COLUMN `captureDepartmentId`;
