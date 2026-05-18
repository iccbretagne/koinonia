-- Add composite unique constraint first (so the FK on memberId can use it as prefix index)
ALTER TABLE `member_user_links` ADD CONSTRAINT `member_user_links_memberId_churchId_key` UNIQUE (`memberId`, `churchId`);

-- Now drop old single-column unique index (FK will use the composite index above)
DROP INDEX `member_user_links_memberId_key` ON `member_user_links`;
