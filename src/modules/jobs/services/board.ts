import { prisma } from "@/lib/prisma";
import { canManageJobs } from "./access";

/**
 * Chargement de l'espace Offres (spec 064) : les quatre sortes de publications ramenées à une
 * forme commune, déjà filtrées par visibilité. Un modérateur voit tout ; les autres voient les
 * publications actives et toutes les leurs, quel que soit leur état.
 */

export type PublicationKind = "OFFER" | "MISSION" | "SEEKER" | "FREELANCE";
export type PublicationState = "active" | "retired" | "expired" | "filled" | "found" | "unavailable";
export type ContractType = "EMPLOI" | "STAGE" | "ALTERNANCE";
export type Modality = "REMOTE" | "ONSITE" | "HYBRID";

export interface Publication {
  readonly kind: PublicationKind;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly state: PublicationState;
  readonly href: string;
  readonly createdAt: string;
  readonly author: { readonly id: string; readonly name: string };
  readonly isOwn: boolean;
  /** Opportunité d'autrui parue depuis la dernière visite de l'espace. */
  readonly isNew: boolean;
  /** Offre : entreprise ; mission et freelance : domaine ; recherche : secteur. */
  readonly organization: string | null;
  /** Offre : son type ; recherche : les contrats visés. */
  readonly contractTypes: readonly ContractType[];
  readonly location: string | null;
  readonly remote: boolean;
  readonly modality: Modality | null;
  readonly duration: string | null;
  readonly deadline: string | null;
  readonly availableFrom: string | null;
  readonly dailyRate: string | null;
  readonly hourlyRate: string | null;
  readonly description: string;
  readonly contactEmail: string | null;
  readonly contactUrl: string | null;
  readonly renewalRequestedAt: string | null;
}

export interface JobsBoard {
  readonly publications: Publication[];
  readonly canManage: boolean;
  readonly lastSeenAt: string;
}

type BoardSession = { user: { id: string; isSuperAdmin: boolean; churchRoles?: { role: string }[] } };

interface Ctx {
  readonly userId: string;
  readonly now: Date;
  readonly lastSeenAt: Date | null;
}

/** Ligne Prisma de l'un des quatre modèles, réduite aux champs lus ici. */
interface Row {
  id: string;
  title: string;
  status: string;
  description: string;
  createdAt: Date;
  authorId: string;
  author: { id: string; name: string | null; displayName: string | null };
  contactEmail: string | null;
  contactUrl: string | null;
  location: string | null;
  type?: string;
  company?: string;
  domain?: string;
  sector?: string | null;
  duration?: string | null;
  deadline?: Date | null;
  renewalRequestedAt?: Date | null;
  wantEmploi?: boolean;
  wantStage?: boolean;
  wantAlternance?: boolean;
  remote?: boolean;
  modality?: string;
  availableFrom?: Date | null;
  dailyRate?: string | null;
  hourlyRate?: string | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const HREF: Record<PublicationKind, (id: string) => string> = {
  OFFER: (id) => `/jobs/${id}`,
  MISSION: (id) => `/jobs/freelance/missions/${id}`,
  SEEKER: (id) => `/jobs/seekers/${id}`,
  FREELANCE: (id) => `/jobs/freelance/profiles/${id}`,
};

function stateOf(kind: PublicationKind, row: Row, now: Date): PublicationState {
  if (row.status === "ARCHIVED") return "retired";
  if (kind === "OFFER") return row.deadline && row.deadline < now ? "expired" : "active";
  if (row.status === "FILLED") return "filled";
  if (row.status === "FOUND") return "found";
  if (row.status === "UNAVAILABLE") return "unavailable";
  return "active";
}

function contractTypesOf(kind: PublicationKind, row: Row): ContractType[] {
  if (kind === "OFFER") return [row.type as ContractType];
  if (kind !== "SEEKER") return [];
  const types: ContractType[] = [];
  if (row.wantEmploi) types.push("EMPLOI");
  if (row.wantStage) types.push("STAGE");
  if (row.wantAlternance) types.push("ALTERNANCE");
  return types;
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** Forme commune d'une publication, avec son état d'affichage et ses repères. */
export function toPublication(kind: PublicationKind, row: Row, ctx: Ctx): Publication {
  const state = stateOf(kind, row, ctx.now);
  const isOwn = row.authorId === ctx.userId;
  const isOpportunity = kind === "OFFER" || kind === "MISSION";
  return {
    kind,
    id: row.id,
    title: row.title,
    status: row.status,
    state,
    href: HREF[kind](row.id),
    createdAt: row.createdAt.toISOString(),
    author: { id: row.author.id, name: row.author.displayName ?? row.author.name ?? "Anonyme" },
    isOwn,
    isNew: isOpportunity && !isOwn && state === "active" && !!ctx.lastSeenAt && row.createdAt > ctx.lastSeenAt,
    organization: row.company ?? row.domain ?? row.sector ?? null,
    contractTypes: contractTypesOf(kind, row),
    location: row.location,
    remote: row.remote ?? false,
    modality: (row.modality as Modality | undefined) ?? null,
    duration: row.duration ?? null,
    deadline: iso(row.deadline),
    availableFrom: iso(row.availableFrom),
    dailyRate: row.dailyRate ?? null,
    hourlyRate: row.hourlyRate ?? null,
    description: row.description,
    contactEmail: row.contactEmail,
    contactUrl: row.contactUrl,
    renewalRequestedAt: iso(row.renewalRequestedAt),
  };
}

/** Filtres de visibilité par modèle ; un modérateur n'en a aucun. */
function visibility(canManage: boolean, userId: string, now: Date) {
  if (canManage) return { offer: {}, other: {} };
  return {
    offer: { OR: [{ status: "PUBLISHED" as const, OR: [{ deadline: null }, { deadline: { gte: now } }] }, { authorId: userId }] },
    other: { OR: [{ status: "ACTIVE" as const }, { authorId: userId }] },
  };
}

const AUTHOR = { author: { select: { id: true, name: true, displayName: true } } } as const;

export async function loadJobsBoard(session: BoardSession, { now = new Date() }: { now?: Date } = {}): Promise<JobsBoard> {
  const userId = session.user.id;
  const canManage = canManageJobs(session);
  const where = visibility(canManage, userId, now);
  const orderBy = { createdAt: "desc" as const };

  const [lastSeen, offers, missions, seekers, profiles] = await Promise.all([
    prisma.jobLastSeen.findUnique({ where: { userId }, select: { seenAt: true } }),
    prisma.jobOffer.findMany({ where: where.offer, include: AUTHOR, orderBy }),
    prisma.freelanceMission.findMany({ where: where.other, include: AUTHOR, orderBy }),
    prisma.jobSeeker.findMany({ where: where.other, include: AUTHOR, orderBy }),
    prisma.freelanceProfile.findMany({ where: where.other, include: AUTHOR, orderBy }),
  ]);

  // Lu avant que le client ne remette le compteur à zéro ; à défaut, la fenêtre du compteur.
  const lastSeenAt = lastSeen?.seenAt ?? new Date(now.getTime() - THIRTY_DAYS_MS);
  const ctx: Ctx = { userId, now, lastSeenAt };

  const publications = [
    ...offers.map((r) => toPublication("OFFER", r as Row, ctx)),
    ...missions.map((r) => toPublication("MISSION", r as Row, ctx)),
    ...seekers.map((r) => toPublication("SEEKER", r as Row, ctx)),
    ...profiles.map((r) => toPublication("FREELANCE", r as Row, ctx)),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { publications, canManage, lastSeenAt: lastSeenAt.toISOString() };
}

/**
 * Une publication pour sa page de détail ; `null` si elle n'existe pas ou si l'appelant ne peut
 * pas la voir (non active, et ni auteur ni modérateur).
 */
export async function loadPublication(
  session: BoardSession,
  kind: PublicationKind,
  id: string,
  { now = new Date() }: { now?: Date } = {}
): Promise<{ publication: Publication; canManage: boolean } | null> {
  const args = { where: { id }, include: AUTHOR };
  let row: unknown;
  if (kind === "OFFER") row = await prisma.jobOffer.findUnique(args);
  else if (kind === "MISSION") row = await prisma.freelanceMission.findUnique(args);
  else if (kind === "SEEKER") row = await prisma.jobSeeker.findUnique(args);
  else row = await prisma.freelanceProfile.findUnique(args);
  if (!row) return null;

  const canManage = canManageJobs(session);
  const publication = toPublication(kind, row as Row, { userId: session.user.id, now, lastSeenAt: null });
  if (publication.state !== "active" && !publication.isOwn && !canManage) return null;
  return { publication, canManage };
}
