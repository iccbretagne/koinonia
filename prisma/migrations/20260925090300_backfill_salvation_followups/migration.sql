-- Spec 052 (lot 2, issue #580) — rattrapage : un suivi MSDP `SUBMITTED` pour chaque demande
-- d'accueil non archivée qui a coché l'appel au salut et n'a pas encore de suivi. Depuis le
-- lot 1, toute NOUVELLE soumission crée déjà son suivi automatiquement (intake.ts, via
-- l'événement `request.submitted`) ; cette migration ne couvre que le passé.
--
-- Identifiant généré en SQL (`CONCAT('c', REPLACE(UUID(), '-', ''))`), compatible avec le
-- format des identifiants texte existants (cuid côté Prisma).

-- 1. Un suivi SUBMITTED par demande d'accueil non archivée, appel au salut coché, sans suivi.
INSERT INTO `msdp_follow_ups`
  (`id`, `churchId`, `requestId`, `firstName`, `lastName`, `phone`, `email`, `status`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('c', REPLACE(UUID(), '-', '')),
  f.`churchId`,
  f.`id`,
  f.`firstName`,
  f.`lastName`,
  f.`phone`,
  f.`email`,
  'SUBMITTED',
  NOW(3),
  NOW(3)
FROM `family_integration_requests` f
LEFT JOIN `msdp_follow_ups` m ON m.`requestId` = f.`id`
WHERE f.`salvationCall` = 1
  AND f.`archivedAt` IS NULL
  AND m.`id` IS NULL;

-- 2. Rapprochement : dossier de parcours de la demande d'accueil source, quand il existe.
UPDATE `msdp_follow_ups` m
JOIN `person_journeys` pj ON pj.`sourceRequestId` = m.`requestId`
SET m.`personJourneyId` = pj.`id`
WHERE m.`personJourneyId` IS NULL
  AND m.`requestId` IS NOT NULL;
