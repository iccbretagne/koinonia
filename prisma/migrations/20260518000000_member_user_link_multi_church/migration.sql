-- Drop old single-member unique constraint
DROP INDEX `member_user_links_memberId_key` ON `member_user_links`;

-- Add composite unique constraint (memberId, churchId)
ALTER TABLE `member_user_links` ADD CONSTRAINT `member_user_links_memberId_churchId_key` UNIQUE (`memberId`, `churchId`);
