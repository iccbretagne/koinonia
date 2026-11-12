-- CreateTable
CREATE TABLE `mcp_confirmations` (
    `id` VARCHAR(191) NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `hash` CHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcp_confirmations_hash_key`(`hash`),
    INDEX `mcp_confirmations_grantId_idx`(`grantId`),
    INDEX `mcp_confirmations_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcp_confirmations` ADD CONSTRAINT `mcp_confirmations_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `mcp_grants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
