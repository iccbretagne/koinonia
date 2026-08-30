import type { Role } from "../../src/generated/prisma/client";

/**
 * Comptes de test de l'environnement de développement.
 *
 * Un compte par rôle métier de l'application (voir CLAUDE.md, section « Roles et
 * permissions ») : Super Admin, Admin, Secrétaire, Ministre, Resp. département,
 * Faiseur de Disciples, Reporter, STAR. Deux comptes Resp. département sont
 * rattachés à des départements distincts pour observer l'effet du périmètre
 * (scoping) sur les données visibles.
 *
 * Les rôles additionnels de modules hors périmètre de cette feature (agenda pastoral,
 * comptabilité — AGENDA_QUALIFIER, ACCOUNTANT) n'ont pas de compte dédié ici.
 *
 * Consommé à la fois par `prisma/seed-dev.ts` (création des comptes) et par
 * `src/lib/auth.ts` (liste affichée par le provider de connexion développement) —
 * source unique de vérité pour ne jamais les faire diverger.
 */
export interface DevUserDef {
  key: string;
  email: string;
  name: string;
  displayName: string;
  role: Role;
  churchKey: string;
  /** Uniquement pour le rôle MINISTER. */
  ministryKey?: string;
  /** Uniquement pour le rôle DEPARTMENT_HEAD. */
  departmentKeys?: string[];
  /**
   * Sous-ensemble de `departmentKeys` où le compte est **adjoint** et non
   * responsable principal (`UserDepartment.isDeputy`). Alimenté par la fixture
   * de formation, où l'on veut rejouer les binômes responsable/adjoint réels.
   */
  deputyDepartmentKeys?: string[];
  /**
   * Pour STAR / DISCIPLE_MAKER : le compte doit être lié à une fiche membre
   * (MemberUserLink). Le seed crée cette fiche dans ce département.
   */
  linkedMemberDepartmentKey?: string;
}

export const DEV_USERS: DevUserDef[] = [
  {
    key: "super-admin",
    email: "super.admin@dev.local",
    name: "Suzanne Admin",
    displayName: "Super Admin",
    role: "SUPER_ADMIN",
    churchKey: "kervignac",
  },
  {
    key: "admin",
    email: "admin@dev.local",
    name: "Alain Directeur",
    displayName: "Admin",
    role: "ADMIN",
    churchKey: "kervignac",
  },
  {
    key: "secretaire",
    email: "secretaire@dev.local",
    name: "Sophie Secrétaire",
    displayName: "Secrétaire",
    role: "SECRETARY",
    churchKey: "kervignac",
  },
  {
    key: "ministre",
    email: "ministre@dev.local",
    name: "Marc Ministre",
    displayName: "Ministre Communication",
    role: "MINISTER",
    churchKey: "kervignac",
    ministryKey: "communication",
  },
  {
    key: "resp-accueil",
    email: "resp.accueil@dev.local",
    name: "Rachel Responsable",
    displayName: "Resp. Accueil",
    role: "DEPARTMENT_HEAD",
    churchKey: "kervignac",
    departmentKeys: ["accueil"],
  },
  {
    key: "resp-secretariat",
    email: "resp.secretariat@dev.local",
    name: "Robert Responsable",
    displayName: "Resp. Secrétariat",
    role: "DEPARTMENT_HEAD",
    churchKey: "kervignac",
    departmentKeys: ["secretariat"],
  },
  {
    key: "faiseur-disciples",
    email: "faiseur.disciples@dev.local",
    name: "Fabienne Disciple",
    displayName: "Faiseur de Disciples",
    role: "DISCIPLE_MAKER",
    churchKey: "kervignac",
    linkedMemberDepartmentKey: "evangelisation",
  },
  {
    key: "reporter",
    email: "reporter@dev.local",
    name: "Renaud Reporter",
    displayName: "Reporter",
    role: "REPORTER",
    churchKey: "kervignac",
  },
  {
    key: "star",
    email: "star@dev.local",
    name: "Stella Star",
    displayName: "STAR",
    role: "STAR",
    churchKey: "kervignac",
    linkedMemberDepartmentKey: "accueil",
  },
];
