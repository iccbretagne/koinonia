-- Migration: member_multi_department
-- Remplace la relation 1-N Member→Department par une N-N via MemberDepartment.
-- Le département existant devient le département principal (isPrimary = true).

-- 1. Créer la table de jointure
CREATE TABLE `member_departments` (
  `id`           VARCHAR(191) NOT NULL,
  `memberId`     VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `isPrimary`    BOOLEAN      NOT NULL DEFAULT false,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `member_departments_memberId_departmentId_key` (`memberId`, `departmentId`),
  CONSTRAINT `member_departments_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_departments_departmentId_fkey`
    FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 2. Migrer les données existantes : chaque membre → ligne isPrimary = true
INSERT INTO `member_departments` (`id`, `memberId`, `departmentId`, `isPrimary`)
SELECT
  CONCAT('md_', `id`) AS `id`,
  `id`                AS `memberId`,
  `departmentId`      AS `departmentId`,
  true                AS `isPrimary`
FROM `members`;

-- 3. Supprimer la contrainte FK et la colonne departmentId de members
ALTER TABLE `members` DROP FOREIGN KEY `members_departmentId_fkey`;
ALTER TABLE `members` DROP COLUMN `departmentId`;
