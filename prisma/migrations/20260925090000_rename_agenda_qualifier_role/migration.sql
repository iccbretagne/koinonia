-- Spec 052 (issue #580) — renomme le rôle AGENDA_QUALIFIER en PASTORAL_CARE_REFERENT.
--
-- Le périmètre du rôle ne se limite plus à l'agenda (qualification des rendez-vous
-- pastoraux ET des suivis de nouveaux convertis, module `care`) : on renomme le rôle
-- pour qu'il dise ce qu'il fait, plutôt que de garder un nom hérité de l'agenda.
--
-- Écrite à la main : une redéfinition directe de l'enum Prisma ferait échouer les
-- lignes existantes qui portent encore l'ancienne valeur. Trois temps sur la colonne
-- enum native MySQL de `user_church_roles.role` :
--   1. élargir l'enum pour accepter la nouvelle valeur (sans retirer l'ancienne) ;
--   2. réécrire les lignes existantes ;
--   3. figer l'enum sur son jeu de valeurs final (ancienne valeur retirée).
--
-- `member_link_requests.requestedRole` est une colonne texte libre (pas un enum) qui ne
-- porte jamais ce rôle (vérifié en amont : DEPARTMENT_HEAD | DEPUTY | MINISTER |
-- DISCIPLE_MAKER | REPORTER) — rien à faire de ce côté.

-- 1. Élargir l'enum : ancienne + nouvelle valeur coexistent.
ALTER TABLE `user_church_roles`
  MODIFY `role` ENUM(
    'SUPER_ADMIN','ADMIN','SECRETARY','MINISTER','DEPARTMENT_HEAD','DISCIPLE_MAKER',
    'REPORTER','STAR','AGENDA_QUALIFIER','ACCOUNTANT','PASTORAL_CARE_REFERENT'
  ) NOT NULL;

-- 2. Réécrire les lignes existantes.
UPDATE `user_church_roles`
SET `role` = 'PASTORAL_CARE_REFERENT'
WHERE `role` = 'AGENDA_QUALIFIER';

-- 3. Retirer l'ancienne valeur : plus aucune ligne ne la porte après l'étape 2.
--    Ordre final aligné sur schema.prisma (PASTORAL_CARE_REFERENT avant ACCOUNTANT).
ALTER TABLE `user_church_roles`
  MODIFY `role` ENUM(
    'SUPER_ADMIN','ADMIN','SECRETARY','MINISTER','DEPARTMENT_HEAD','DISCIPLE_MAKER',
    'REPORTER','STAR','PASTORAL_CARE_REFERENT','ACCOUNTANT'
  ) NOT NULL;
