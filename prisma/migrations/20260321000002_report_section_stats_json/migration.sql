-- Migration: remplacer present/absent/newcomers par stats JSON
-- Raison : chaque département a des champs statistiques spécifiques
--   Accueil     : hommes, femmes, enfants
--   Sainte Cène : supportsUtilises, supportsRestants
--   Intégration : hommes, femmes, passage, convertis, voeux

ALTER TABLE `event_report_sections`
  DROP COLUMN `present`,
  DROP COLUMN `absent`,
  DROP COLUMN `newcomers`,
  ADD COLUMN `stats` JSON NULL;
