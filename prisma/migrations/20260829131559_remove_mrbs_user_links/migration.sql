/*
  Warnings:

  - You are about to drop the `mrbs_user_links` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `mrbs_user_links` DROP FOREIGN KEY `mrbs_user_links_churchId_fkey`;

-- DropForeignKey
ALTER TABLE `mrbs_user_links` DROP FOREIGN KEY `mrbs_user_links_linkedById_fkey`;

-- DropForeignKey
ALTER TABLE `mrbs_user_links` DROP FOREIGN KEY `mrbs_user_links_userId_fkey`;

-- DropTable
DROP TABLE `mrbs_user_links`;
