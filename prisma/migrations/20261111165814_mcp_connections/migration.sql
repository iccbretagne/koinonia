-- CreateTable
CREATE TABLE `mcp_clients` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `redirectUris` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcp_clients_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcp_grants` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(191) NULL,

    INDEX `mcp_grants_userId_idx`(`userId`),
    INDEX `mcp_grants_churchId_idx`(`churchId`),
    INDEX `mcp_grants_clientId_idx`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcp_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `kind` ENUM('CODE', 'ACCESS', 'REFRESH') NOT NULL,
    `hash` CHAR(64) NOT NULL,
    `codeChallenge` VARCHAR(128) NULL,
    `redirectUri` VARCHAR(500) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `mcp_tokens_hash_key`(`hash`),
    INDEX `mcp_tokens_grantId_idx`(`grantId`),
    INDEX `mcp_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcp_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'singleton',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcp_church_settings` (
    `churchId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`churchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mcp_calls` (
    `id` VARCHAR(191) NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `churchId` VARCHAR(191) NOT NULL,
    `tool` VARCHAR(100) NOT NULL,
    `outcome` VARCHAR(20) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mcp_calls_churchId_createdAt_idx`(`churchId`, `createdAt`),
    INDEX `mcp_calls_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `mcp_calls_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mcp_grants` ADD CONSTRAINT `mcp_grants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcp_grants` ADD CONSTRAINT `mcp_grants_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcp_grants` ADD CONSTRAINT `mcp_grants_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `mcp_clients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcp_tokens` ADD CONSTRAINT `mcp_tokens_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `mcp_grants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mcp_church_settings` ADD CONSTRAINT `mcp_church_settings_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
