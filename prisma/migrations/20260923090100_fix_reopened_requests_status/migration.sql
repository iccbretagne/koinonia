-- Spec 051 — correction des demandes d'intégration incohérentes.
--
-- L'ancienne action `reopen` repassait une demande abandonnée à SUBMITTED sans détacher la
-- famille ni le berger affectés : la demande réapparaissait comme neuve dans la file alors
-- qu'un berger la croyait toujours sienne. On aligne le statut sur la vérité des données
-- (l'affectation est un fait, le statut était faux) plutôt que d'effacer l'affectation.
-- `assignedAt` est complété s'il manque, pour que la fiche reste cohérente.
UPDATE `family_integration_requests`
SET `status` = 'ASSIGNED',
    `assignedAt` = COALESCE(`assignedAt`, `updatedAt`)
WHERE `status` = 'SUBMITTED'
  AND (`assignedFamilyId` IS NOT NULL OR `assignedBergerId` IS NOT NULL);
