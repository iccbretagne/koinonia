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
 * Deux rôles de module ont aussi un compte (harnais E2E, docs/e2e.md) : Comptable
 * (ACCOUNTANT) et Référent soins pastoraux (PASTORAL_CARE_REFERENT).
 * Un compte « pasteur » n'a aucun rôle d'église (`role: null`) : seul son profil pastoral,
 * lié par le seed, lui ouvre l'église — le même chemin qu'un vrai pasteur
 * (`pastoralChurchIds`).
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
  /** `null` : aucun rôle d'église, compte ouvert par son seul profil pastoral. */
  role: Role | null;
  churchKey: string;
  /** Profil pastoral lié au compte dans `churchKey` (seed : `PastoralProfile.userId`). */
  pastoralProfile?: boolean;
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
  {
    key: "comptable",
    email: "comptable@dev.local",
    name: "Camille Comptable",
    displayName: "Comptable",
    role: "ACCOUNTANT",
    churchKey: "kervignac",
  },
  {
    key: "referent-soins",
    email: "referent.soins@dev.local",
    name: "Pascal Référent",
    displayName: "Référent soins pastoraux",
    role: "PASTORAL_CARE_REFERENT",
    churchKey: "kervignac",
  },
  {
    key: "pasteur",
    email: "pasteur@dev.local",
    name: "Paul Pasteur",
    displayName: "Pasteur",
    role: null,
    churchKey: "kervignac",
    pastoralProfile: true,
  },
];
