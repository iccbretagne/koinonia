import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/errors";
import { normalizeHost } from "@/lib/site-host";

/**
 * Domaines dédiés des sites d'événement (spec 084, ADR-0031). Un domaine n'est servi qu'après
 * trois étapes : demande (jeton de preuve), vérification DNS (TXT + CNAME/A), approbation du Super
 * Admin. Un recontrôle quotidien suspend le domaine dont le DNS ne répond plus.
 */

export const MAX_DOMAINS_PER_CHURCH = 5;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string | null, churchId: string, entityId: string, details: Record<string, unknown>) {
  if (!userId) return;
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "TicketingSiteDomain", entityId, details });
}

async function notifyOrganizers(eventId: string, type: string, title: string, message: string) {
  const { notifyEventTeam } = await import("./team-notify");
  await notifyEventTeam(eventId, ["ORGANIZER"], { type, title, message, link: `/billetterie/${eventId}?vue=site` });
}

function appHost(): string {
  const url = process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  try {
    return url ? normalizeHost(new URL(url).host) : "";
  } catch {
    return "";
  }
}

/** Nom de domaine acceptable ; lève 400 sinon. Jamais le domaine des sites ni celui de l'application. */
export function parseDomain(input: string): string {
  const host = normalizeHost(input);
  const labels = host.split(".");
  const valid = host.length <= 253 && labels.length >= 2 && labels.every((l) => LABEL.test(l)) && /^[a-z]{2,}$/.test(labels[labels.length - 1]);
  if (!valid) throw new ApiError(400, "Nom de domaine invalide (exemple : fete.exemple.org)");
  const under = (base: string) => !!base && (host === base || host.endsWith(`.${base}`));
  if (under(normalizeHost(process.env.SITE_BASE_DOMAIN))) throw new ApiError(400, "Ce domaine est celui des sites Koinonia : utilisez votre propre domaine");
  if (under(appHost())) throw new ApiError(400, "Ce domaine est celui de l'application");
  return host;
}

export interface DomainView {
  id: string;
  host: string;
  status: "PENDING" | "VERIFIED" | "APPROVED" | "SUSPENDED";
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Enregistrements DNS à créer. */
  records: { type: string; name: string; value: string }[];
}

function view(d: { id: string; host: string; proofToken: string; status: DomainView["status"]; lastCheckedAt: Date | null; lastError: string | null }): DomainView {
  const target = process.env.SITE_TARGET_HOST ?? "";
  return {
    id: d.id,
    host: d.host,
    status: d.status,
    lastCheckedAt: d.lastCheckedAt?.toISOString() ?? null,
    lastError: d.lastError,
    records: [
      { type: "TXT", name: `_koinonia.${d.host}`, value: d.proofToken },
      { type: "CNAME", name: d.host, value: target || "(non configuré)" },
    ],
  };
}

export async function getDomain(eventId: string): Promise<DomainView | null> {
  const row = await (await db()).ticketingSiteDomain.findFirst({ where: { site: { eventId } } });
  return row ? view(row) : null;
}

export async function requestDomain(eventId: string, userId: string, input: string): Promise<DomainView> {
  const host = parseDomain(input);
  const prisma = await db();
  const site = await prisma.ticketingSite.findUnique({ where: { eventId }, select: { id: true, churchId: true, domain: { select: { id: true } } } });
  if (!site) throw new ApiError(404, "Site introuvable");
  if (site.domain) throw new ApiError(409, "Ce site a déjà un domaine : supprimez-le avant d'en demander un autre");
  const used = await prisma.ticketingSiteDomain.count({ where: { churchId: site.churchId, status: { not: "SUSPENDED" } } });
  if (used >= MAX_DOMAINS_PER_CHURCH) throw new ApiError(409, `Cinq domaines dédiés au plus par église (${MAX_DOMAINS_PER_CHURCH})`);
  if (await prisma.ticketingSiteDomain.findUnique({ where: { host }, select: { id: true } })) throw new ApiError(409, "Ce domaine est déjà utilisé");
  const row = await prisma.ticketingSiteDomain.create({ data: { siteId: site.id, churchId: site.churchId, host, proofToken: randomBytes(24).toString("hex") } });
  await audit(userId, site.churchId, row.id, { requested: host });
  return view(row);
}

export async function removeDomain(eventId: string, userId: string): Promise<void> {
  const prisma = await db();
  const row = await prisma.ticketingSiteDomain.findFirst({ where: { site: { eventId } } });
  if (!row) throw new ApiError(404, "Aucun domaine");
  await prisma.ticketingSiteDomain.delete({ where: { id: row.id } });
  await audit(userId, row.churchId, row.id, { removed: row.host });
}

// ── DNS ──────────────────────────────────────────────────────────────────────

type Dns = {
  resolveTxt(host: string): Promise<string[][]>;
  resolveCname(host: string): Promise<string[]>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
};

/** Un échec de résolution (domaine ou enregistrement absent) vaut « rien trouvé ». */
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

/**
 * Le domaine prouve sa maîtrise (TXT `_koinonia.<hôte>` contenant le jeton) et pointe vers nous
 * (CNAME vers `SITE_TARGET_HOST`, ou mêmes adresses A/AAAA). Renvoie le motif de l'échec, ou `null`.
 */
export async function checkDns(host: string, proofToken: string, dns?: Dns): Promise<string | null> {
  const target = normalizeHost(process.env.SITE_TARGET_HOST);
  if (!target) return "Serveur cible non configuré (SITE_TARGET_HOST)";
  const resolver = dns ?? (await import("node:dns/promises"));
  const txt = (await safe(resolver.resolveTxt(`_koinonia.${host}`))).map((chunks) => chunks.join(""));
  if (!txt.includes(proofToken)) return `Enregistrement TXT « _koinonia.${host} » introuvable ou différent du jeton`;
  const cname = (await safe(resolver.resolveCname(host))).map(normalizeHost);
  if (cname.includes(target)) return null;
  const mine = [...(await safe(resolver.resolve4(host))), ...(await safe(resolver.resolve6(host)))];
  const theirs = new Set([...(await safe(resolver.resolve4(target))), ...(await safe(resolver.resolve6(target)))]);
  if (mine.length > 0 && mine.every((ip) => theirs.has(ip))) return null;
  return `Le domaine ne pointe pas vers ${target} (CNAME ou adresses identiques attendus)`;
}

/** Vérifie le DNS d'un domaine en attente (ou suspendu) ; le rend « vérifié », ou « approuvé » s'il l'avait été. */
export async function verifyDomain(eventId: string, userId: string, dns?: Dns): Promise<DomainView> {
  const prisma = await db();
  const row = await prisma.ticketingSiteDomain.findFirst({ where: { site: { eventId } } });
  if (!row) throw new ApiError(404, "Aucun domaine");
  if (row.status === "VERIFIED" || row.status === "APPROVED") return view(row);
  const error = await checkDns(row.host, row.proofToken, dns);
  const status = error ? row.status : row.approvedById ? "APPROVED" : "VERIFIED";
  const updated = await prisma.ticketingSiteDomain.update({ where: { id: row.id }, data: { status, lastCheckedAt: new Date(), lastError: error?.slice(0, 300) ?? null } });
  await audit(userId, row.churchId, row.id, { verified: !error });
  return view(updated);
}

// ── Super Admin ──────────────────────────────────────────────────────────────

export async function approveDomain(domainId: string, adminId: string): Promise<void> {
  const prisma = await db();
  const row = await prisma.ticketingSiteDomain.findUnique({ where: { id: domainId }, include: { site: { select: { eventId: true } } } });
  if (!row) throw new ApiError(404, "Domaine introuvable");
  if (row.status !== "VERIFIED") throw new ApiError(409, "Seul un domaine dont le DNS est vérifié peut être approuvé");
  await prisma.ticketingSiteDomain.update({ where: { id: row.id }, data: { status: "APPROVED", approvedById: adminId, lastError: null } });
  await audit(adminId, row.churchId, row.id, { approved: row.host });
  await notifyOrganizers(row.site.eventId, "TICKETING_SITE_DOMAIN", "Domaine approuvé", `Le site est désormais servi sur ${row.host}.`);
}

/** Refuse la demande : le domaine est supprimé (libère le quota) et l'organisateur est prévenu. */
export async function rejectDomain(domainId: string, adminId: string, reason?: string): Promise<void> {
  const prisma = await db();
  const row = await prisma.ticketingSiteDomain.findUnique({ where: { id: domainId }, include: { site: { select: { eventId: true } } } });
  if (!row) throw new ApiError(404, "Domaine introuvable");
  await prisma.ticketingSiteDomain.delete({ where: { id: row.id } });
  await audit(adminId, row.churchId, row.id, { rejected: row.host, reason: reason ?? null });
  await notifyOrganizers(row.site.eventId, "TICKETING_SITE_DOMAIN", "Domaine refusé", `La demande pour ${row.host} a été refusée${reason ? ` : ${reason}` : "."}`);
}

export interface DomainRow extends DomainView {
  churchName: string;
  eventTitle: string;
  siteSlug: string;
}

/** Toutes les demandes, les plus anciennes en attente d'abord (écran Super Admin). */
export async function listDomains(): Promise<DomainRow[]> {
  const rows = await (await db()).ticketingSiteDomain.findMany({
    orderBy: { createdAt: "asc" },
    include: { site: { select: { slug: true, event: { select: { title: true, church: { select: { name: true } } } } } } },
  });
  return rows.map((r) => ({ ...view(r), churchName: r.site.event.church.name, eventTitle: r.site.event.title, siteSlug: r.site.slug }));
}

// ── Cache du proxy, recontrôle quotidien ─────────────────────────────────────

/** Hôte → adresse du site, pour les domaines approuvés (lu par le proxy via un appel interne). */
export async function approvedHosts(): Promise<Record<string, string>> {
  const rows = await (await db()).ticketingSiteDomain.findMany({ where: { status: "APPROVED" }, select: { host: true, site: { select: { slug: true } } } });
  return Object.fromEntries(rows.map((r) => [r.host, r.site.slug]));
}

/** Domaine approuvé d'un événement, pour les liens des emails ; `null` sinon. */
export async function approvedHostOfEvent(eventId: string): Promise<string | null> {
  const row = await (await db()).ticketingSiteDomain.findFirst({ where: { status: "APPROVED", site: { eventId } }, select: { host: true } });
  return row?.host ?? null;
}

/** Tâche quotidienne : un domaine approuvé dont le DNS ne répond plus est suspendu, l'organisateur prévenu. */
export async function recheckDomains(dns?: Dns): Promise<{ checked: number; suspended: number }> {
  const prisma = await db();
  const rows = await prisma.ticketingSiteDomain.findMany({ where: { status: "APPROVED" }, include: { site: { select: { eventId: true } } } });
  let suspended = 0;
  for (const row of rows) {
    const error = await checkDns(row.host, row.proofToken, dns);
    if (!error) {
      await prisma.ticketingSiteDomain.update({ where: { id: row.id }, data: { lastCheckedAt: new Date(), lastError: null } });
      continue;
    }
    suspended++;
    await prisma.ticketingSiteDomain.update({ where: { id: row.id }, data: { status: "SUSPENDED", lastCheckedAt: new Date(), lastError: error.slice(0, 300) } });
    await notifyOrganizers(row.site.eventId, "TICKETING_SITE_DOMAIN", "Domaine suspendu", `${row.host} ne répond plus comme prévu (${error}). Le site reste disponible sur son adresse Koinonia ; corrigez le DNS puis vérifiez à nouveau.`);
  }
  return { checked: rows.length, suspended };
}
