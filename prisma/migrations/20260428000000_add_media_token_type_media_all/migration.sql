-- AlterTable: add MEDIA_ALL to MediaTokenType enum
ALTER TABLE `media_share_tokens` MODIFY COLUMN `type` ENUM('VALIDATOR', 'MEDIA', 'MEDIA_ALL', 'PREVALIDATOR', 'GALLERY') NOT NULL;
