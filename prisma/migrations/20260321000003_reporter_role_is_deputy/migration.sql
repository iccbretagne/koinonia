-- Add REPORTER to Role enum
ALTER TABLE `user_church_roles`
  MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SECRETARY', 'MINISTER', 'DEPARTMENT_HEAD', 'DISCIPLE_MAKER', 'REPORTER') NOT NULL;

-- Add isDeputy to UserDepartment (if not already present)
ALTER TABLE `user_departments`
  ADD COLUMN IF NOT EXISTS `isDeputy` BOOLEAN NOT NULL DEFAULT FALSE;
