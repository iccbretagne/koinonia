-- Step 1: Add departmentId column to tasks (nullable initially)
ALTER TABLE `tasks` ADD COLUMN `departmentId` VARCHAR(191) NULL;

-- Step 2: Populate departmentId from event_departments
UPDATE `tasks` t
JOIN `event_departments` ed ON t.`eventDepartmentId` = ed.`id`
SET t.`departmentId` = ed.`departmentId`;

-- Step 3: Add eventId column to task_assignments (nullable initially)
ALTER TABLE `task_assignments` ADD COLUMN `eventId` VARCHAR(191) NULL;

-- Step 4: Populate eventId from tasks -> event_departments
UPDATE `task_assignments` ta
JOIN `tasks` t ON ta.`taskId` = t.`id`
JOIN `event_departments` ed ON t.`eventDepartmentId` = ed.`id`
SET ta.`eventId` = ed.`eventId`;

-- Step 5: Deduplicate tasks with same (departmentId, name)
-- For duplicate tasks, keep the one with the earliest createdAt
-- First, update task_assignments to point to the canonical task
UPDATE `task_assignments` ta
JOIN `tasks` t ON ta.`taskId` = t.`id`
JOIN (
  SELECT `departmentId`, `name`, MIN(`id`) AS `canonical_id`
  FROM `tasks`
  GROUP BY `departmentId`, `name`
) canonical ON t.`departmentId` = canonical.`departmentId` AND t.`name` = canonical.`name`
SET ta.`taskId` = canonical.`canonical_id`
WHERE t.`id` != canonical.`canonical_id`;

-- Delete duplicate task_assignments that now have same (taskId, eventId, memberId)
DELETE ta1 FROM `task_assignments` ta1
INNER JOIN `task_assignments` ta2
ON ta1.`taskId` = ta2.`taskId`
  AND ta1.`eventId` = ta2.`eventId`
  AND ta1.`memberId` = ta2.`memberId`
  AND ta1.`id` > ta2.`id`;

-- Delete duplicate tasks (keep canonical)
DELETE t FROM `tasks` t
JOIN (
  SELECT `departmentId`, `name`, MIN(`id`) AS `canonical_id`
  FROM `tasks`
  GROUP BY `departmentId`, `name`
) canonical ON t.`departmentId` = canonical.`departmentId` AND t.`name` = canonical.`name`
WHERE t.`id` != canonical.`canonical_id`;

-- Step 6: Drop old foreign key and index on eventDepartmentId
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_eventDepartmentId_fkey`;
ALTER TABLE `tasks` DROP COLUMN `eventDepartmentId`;

-- Step 7: Make departmentId NOT NULL and add FK
ALTER TABLE `tasks` MODIFY `departmentId` VARCHAR(191) NOT NULL;
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 8: Add unique constraint on (departmentId, name)
ALTER TABLE `tasks` ADD UNIQUE INDEX `tasks_departmentId_name_key`(`departmentId`, `name`);

-- Step 9: Make eventId NOT NULL in task_assignments and add FK
ALTER TABLE `task_assignments` MODIFY `eventId` VARCHAR(191) NOT NULL;
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 10: Drop old FK first (needed before dropping the unique index it depends on), then replace unique constraint and re-add FK with cascade
ALTER TABLE `task_assignments` DROP FOREIGN KEY `task_assignments_taskId_fkey`;
ALTER TABLE `task_assignments` DROP INDEX `task_assignments_taskId_memberId_key`;
ALTER TABLE `task_assignments` ADD UNIQUE INDEX `task_assignments_taskId_eventId_memberId_key`(`taskId`, `eventId`, `memberId`);
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
