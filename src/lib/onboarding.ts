import { prisma } from "@/lib/prisma";

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
