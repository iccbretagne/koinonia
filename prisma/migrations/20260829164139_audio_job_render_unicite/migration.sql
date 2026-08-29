-- AlterTable
ALTER TABLE `audio_jobs` ADD COLUMN `segmentId` VARCHAR(191) NULL,
    ADD COLUMN `sourceHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `audio_jobs_segmentId_sourceHash_key` ON `audio_jobs`(`segmentId`, `sourceHash`);

