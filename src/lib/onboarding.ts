import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";

/**
 * Normalise un nom (minuscules, accents retirés) pour une comparaison insensible
 * à la casse et aux accents. Alignée sur la normalisation de
 * src/app/api/members/search/route.ts.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalise un email (minuscules, espaces retirés) pour une comparaison exacte.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type DuplicateCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

/**
 * Recherche les fiches membres déjà présentes dans l'église (churchId) qui
 * pourraient correspondre à `input` — même email (comparaison normalisée,
 * quand un email est fourni) ou même nom normalisé. Utilisé comme garde-fou
 * anti-doublon avant la création d'une nouvelle fiche membre.
 */
export async function findDuplicateCandidates(
  churchId: string,
  input: { email?: string | null; firstName: string; lastName: string }
): Promise<DuplicateCandidate[]> {
  const members = await prisma.member.findMany({
    where: { departments: { some: { department: { ministry: { churchId } } } } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const normalizedEmail = input.email ? normalizeEmail(input.email) : null;
  const normalizedName = normalizeName(`${input.firstName} ${input.lastName}`);

  return members.filter((member) => {
    const emailMatch =
      normalizedEmail !== null && member.email !== null && normalizeEmail(member.email) === normalizedEmail;
    const nameMatch = normalizeName(`${member.firstName} ${member.lastName}`) === normalizedName;
    return emailMatch || nameMatch;
  });
}

export type CandidateMember = {
  memberId: string;
  firstName: string;
  lastName: string;
  churchId: string;
  churchName: string;
  department: string;
};

/**
 * Réconciliation par email (onboarding self-service, P2) : recherche les fiches
 * membres **non liées** (aucun `MemberUserLink`) dont l'email normalisé correspond
 * à `email`, toutes églises confondues. L'église et le département sont déterminés
 * par le **département principal** (`isPrimary`) de la fiche. Les fiches sans email,
 * déjà liées, ou sans département principal sont exclues.
 */
export async function findUnlinkedMembersByEmail(email: string): Promise<CandidateMember[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const members = await prisma.member.findMany({
    where: { email: { not: null }, userLinks: { none: {} } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      departments: {
        where: { isPrimary: true },
        select: {
          department: {
            select: {
              name: true,
              ministry: { select: { church: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  });

  const candidates: CandidateMember[] = [];
  for (const member of members) {
    if (!member.email || normalizeEmail(member.email) !== normalizedEmail) continue;
    const primary = member.departments[0];
    if (!primary) continue;
    candidates.push({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      churchId: primary.department.ministry.church.id,
      churchName: primary.department.ministry.church.name,
      department: primary.department.name,
    });
  }
  return candidates;
}

/**
 * Garde-fou serveur de l'auto-liaison self-service (P2). Lève `ApiError(403)` si
 * l'auto-liaison n'est PAS autorisée :
 *  - email de session absent, ou différent (normalisé) de l'email de la fiche ;
 *  - fiche déjà liée à un compte dans cette église ;
 *  - fiche n'appartenant pas à `churchId` (pas de département principal dans cette église).
 * Ne retourne rien si l'opération est autorisée. Les vérifications dépendantes de
 * l'état (appartenance église, lien existant) interrogent Prisma → testable via mock.
 */
export async function assertSelfLinkAllowed(
  sessionEmail: string | null | undefined,
  member: { id: string; email: string | null },
  churchId: string
): Promise<void> {
  if (!sessionEmail) {
    throw new ApiError(403, "Aucun email de compte vérifié");
  }
  if (!member.email || normalizeEmail(sessionEmail) !== normalizeEmail(member.email)) {
    throw new ApiError(403, "L'email de votre compte ne correspond pas à cette fiche");
  }

  // La fiche appartient-elle bien à l'église visée (via son département principal) ?
  const inChurch = await prisma.memberDepartment.findFirst({
    where: { memberId: member.id, isPrimary: true, department: { ministry: { churchId } } },
    select: { id: true },
  });
  if (!inChurch) {
    throw new ApiError(403, "Cette fiche n'appartient pas à cette église");
  }

  // La fiche est-elle déjà liée dans cette église ?
  const existingLink = await prisma.memberUserLink.findUnique({
    where: { memberId_churchId: { memberId: member.id, churchId } },
    select: { id: true },
  });
  if (existingLink) {
    throw new ApiError(403, "Cette fiche est déjà liée à un compte");
  }
}
