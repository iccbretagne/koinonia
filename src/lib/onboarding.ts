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

/**
 * Distance d'édition de Levenshtein entre deux chaînes (nombre minimal
 * d'insertions/suppressions/substitutions). Implémentation itérative O(n·m),
 * sans dépendance externe (MariaDB n'offre pas de trigramme).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // suppression
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarité 0..1 entre deux tokens :
 *  - 1.0 si égaux ;
 *  - 0.9 si l'un est préfixe/sous-chaîne de l'autre (longueur ≥ 2) ;
 *  - sinon `1 - levenshtein/max(len)`.
 */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return 0.9;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Découpe une chaîne normalisée en tokens non vides. */
function tokenize(s: string): string[] {
  return normalizeName(s).split(" ").filter(Boolean);
}

/** Seuil de similarité par token de requête (en-deçà → exclusion). */
export const TOKEN_MATCH_THRESHOLD = 0.7;

/** Seuil au-delà duquel une correspondance est jugée « forte ». */
export const STRONG_MATCH_THRESHOLD = 0.9;

/**
 * Traduit un score de correspondance flou (0..1) en une force grossière,
 * exploitable côté UI (badge de pertinence).
 */
export function matchStrength(score: number): "strong" | "possible" {
  return score >= STRONG_MATCH_THRESHOLD ? "strong" : "possible";
}

/**
 * Score de correspondance flou 0..1 entre une requête libre et un nom
 * (prénom + nom), tolérant à l'ordre des mots, aux accents et aux fautes de
 * frappe. Pour chaque token de la requête, on prend la meilleure similarité
 * avec un token du nom. Si un token de requête n'atteint le seuil avec aucun
 * token du nom, le score global est 0 (candidat exclu). Sinon, le score est la
 * moyenne des meilleures similarités par token de requête.
 */
export function tokenMatchScore(query: string, firstName: string, lastName: string): number {
  const queryTokens = tokenize(query);
  const nameTokens = [...tokenize(firstName), ...tokenize(lastName)];
  if (queryTokens.length === 0 || nameTokens.length === 0) return 0;

  let total = 0;
  for (const qt of queryTokens) {
    let best = 0;
    for (const nt of nameTokens) {
      const sim = tokenSimilarity(qt, nt);
      if (sim > best) best = sim;
    }
    if (best < TOKEN_MATCH_THRESHOLD) return 0;
    total += best;
  }
  return total / queryTokens.length;
}

/**
 * Classe des fiches par pertinence vis-à-vis de `query` via `tokenMatchScore`,
 * ne garde que celles au-dessus du seuil, trie par score décroissant puis par
 * nom (lastName, firstName), et limite le nombre de résultats. Le score est
 * exposé via `_score` (à retirer avant sérialisation si non désiré).
 */
export function rankMembersByName<T extends { firstName: string; lastName: string }>(
  query: string,
  members: T[],
  opts?: { threshold?: number; limit?: number }
): Array<T & { _score: number }> {
  const threshold = opts?.threshold ?? TOKEN_MATCH_THRESHOLD;
  const limit = opts?.limit ?? 10;

  return members
    .map((m) => ({ ...m, _score: tokenMatchScore(query, m.firstName, m.lastName) }))
    .filter((m) => m._score >= threshold)
    .sort(
      (a, b) =>
        b._score - a._score ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    )
    .slice(0, limit);
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
