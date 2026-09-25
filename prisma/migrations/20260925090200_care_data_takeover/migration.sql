-- Spec 052 (issue #580) — reprise des données existantes par le module `care`.
--
-- Le module `care` devient propriétaire des demandes de rendez-vous et des suivis de
-- nouveaux convertis. Cette migration recopie ce qui était porté ailleurs (lien inversé
-- vers la demande d'accueil, identité des suivis, rapprochement, jalons déjà atteints),
-- avant de resserrer les contraintes et de retirer l'ancienne colonne devenue inutile.

-- 1. Lien vers la demande d'accueil source, inversé : AppointmentRequest porte désormais
--    la référence (`sourceIntegrationRequestId`), plus FamilyIntegrationRequest.
UPDATE `appointment_requests` a
JOIN `family_integration_requests` f ON f.`appointmentRequestId` = a.`id`
SET a.`sourceIntegrationRequestId` = f.`id`;

-- 2. Rapprochement (spec 052) : le dossier de parcours de la personne, quand elle en a un,
--    pour les demandes issues d'une demande d'accueil.
UPDATE `appointment_requests` a
JOIN `person_journeys` pj ON pj.`sourceRequestId` = a.`sourceIntegrationRequestId`
SET a.`personJourneyId` = pj.`id`
WHERE a.`sourceIntegrationRequestId` IS NOT NULL;

UPDATE `msdp_follow_ups` m
JOIN `person_journeys` pj ON pj.`sourceRequestId` = m.`requestId`
SET m.`personJourneyId` = pj.`id`
WHERE m.`requestId` IS NOT NULL;

-- 3. Date d'affectation des rendez-vous déjà qualifiés : la seule date disponible avant
--    cette migration est `qualifiedAt` (moment où le qualificateur a confié la demande).
UPDATE `appointment_requests`
SET `assignedAt` = `qualifiedAt`
WHERE `status` IN ('VALIDATED', 'SCHEDULED', 'CLOSED')
  AND `qualifiedAt` IS NOT NULL
  AND `assignedAt` IS NULL;

-- 4. Date du rendez-vous pour les demandes déjà planifiées : reprise depuis l'entrée
--    d'agenda liée (une seule par demande, `agenda_entries.requestId` est unique).
UPDATE `appointment_requests` a
JOIN `agenda_entries` e ON e.`requestId` = a.`id`
SET a.`scheduledFor` = e.`startsAt`
WHERE a.`status` IN ('SCHEDULED', 'CLOSED');

-- 5. Identité des suivis MSDP existants, recopiée depuis leur demande d'accueil source —
--    tous en portent une à ce stade (la colonne n'était pas encore optionnelle avant T2).
UPDATE `msdp_follow_ups` m
JOIN `family_integration_requests` f ON f.`id` = m.`requestId`
SET m.`firstName` = f.`firstName`,
    m.`lastName`  = f.`lastName`,
    m.`phone`     = f.`phone`,
    m.`email`     = f.`email`
WHERE m.`requestId` IS NOT NULL;

-- 6. Chaque suivi porte maintenant une identité : la colonne peut être figée NOT NULL.
--    (Un suivi ne peut naître, lot 1 compris, que depuis une demande d'accueil — le cas
--    « né d'un rendez-vous orienté » arrive au lot 2 et alimentera directement ces colonnes.)
ALTER TABLE `msdp_follow_ups`
  MODIFY `firstName` VARCHAR(100) NOT NULL,
  MODIFY `lastName`  VARCHAR(100) NOT NULL;

-- 7. L'ancien lien FamilyIntegrationRequest → AppointmentRequest est remplacé par son
--    inverse (étape 1) : la colonne, désormais inutile, est retirée.
ALTER TABLE `family_integration_requests`
  DROP FOREIGN KEY `family_integration_requests_appointmentRequestId_fkey`;
ALTER TABLE `family_integration_requests`
  DROP INDEX `family_integration_requests_appointmentRequestId_key`;
ALTER TABLE `family_integration_requests`
  DROP COLUMN `appointmentRequestId`;
