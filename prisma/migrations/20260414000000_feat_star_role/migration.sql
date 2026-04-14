-- AlterTable: ajouter la valeur STAR à l'enum Role
ALTER TABLE `user_church_roles` MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SECRETARY', 'MINISTER', 'DEPARTMENT_HEAD', 'DISCIPLE_MAKER', 'REPORTER', 'STAR') NOT NULL;
