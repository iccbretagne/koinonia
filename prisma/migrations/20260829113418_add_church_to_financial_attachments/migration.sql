/*
  Warnings:

  - Added the required column `churchId` to the `financial_attachments` table.

  Reprise (spec 025) : l'église était jusqu'ici déduite de la demande liée — précisément le
  rattachement qu'un appelant peut provoquer pour usurper l'accès à une pièce d'autrui. On rend
  l'église intrinsèque à la pièce, remplie par une reprise en deux temps :
    1. depuis la demande liée quand elle existe (source la plus fiable) ;
    2. depuis le chemin de stockage pour les pièces orphelines, qui suit toujours le format
       `accounting/{churchId}/{horodatage}-{aléa}.{ext}` (src/app/api/accounting/attachments/route.ts).
  Le passage en NOT NULL échoue si une ligne reste sans église récupérable : la migration doit
  échouer bruyamment plutôt qu'inventer un rattachement.
*/

-- AlterTable (colonne d'abord nullable, le temps de la reprise)
ALTER TABLE `financial_attachments` ADD COLUMN `churchId` VARCHAR(191) NULL;

-- Reprise 1/2 : depuis la demande liée
UPDATE `financial_attachments` fa
JOIN `financial_requests` fr ON fr.id = fa.requestId
SET fa.churchId = fr.churchId
WHERE fa.churchId IS NULL;

-- Reprise 2/2 : pièces orphelines, église extraite du chemin de stockage
UPDATE `financial_attachments`
SET `churchId` = SUBSTRING_INDEX(SUBSTRING_INDEX(`s3Key`, '/', 2), '/', -1)
WHERE `churchId` IS NULL
  AND `s3Key` LIKE 'accounting/%/%';

-- Bascule en NOT NULL : échoue si une ligne résiste aux deux reprises ci-dessus.
ALTER TABLE `financial_attachments` MODIFY COLUMN `churchId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `financial_attachments_churchId_idx` ON `financial_attachments`(`churchId`);

-- AddForeignKey
ALTER TABLE `financial_attachments` ADD CONSTRAINT `financial_attachments_churchId_fkey` FOREIGN KEY (`churchId`) REFERENCES `churches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
