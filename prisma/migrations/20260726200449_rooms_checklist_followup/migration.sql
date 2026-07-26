-- AlterTable
ALTER TABLE `room_checklists`
  ADD COLUMN `equipmentOk` BOOLEAN NULL,
  ADD COLUMN `equipmentNotes` TEXT NULL,
  ADD COLUMN `validatedEquipmentOk` BOOLEAN NULL,
  ADD COLUMN `closedWithoutDeclaration` BOOLEAN NOT NULL DEFAULT false;
