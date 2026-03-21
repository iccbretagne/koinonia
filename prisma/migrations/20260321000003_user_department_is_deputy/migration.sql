-- Ajout du flag isDeputy pour distinguer responsable principal et adjoint
ALTER TABLE `user_departments` ADD COLUMN `isDeputy` BOOLEAN NOT NULL DEFAULT FALSE;
