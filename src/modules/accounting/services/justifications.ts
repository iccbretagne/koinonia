import type { FinancialJustificationStatus, Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { assertAttachmentsAssignable } from "./attachments";
import {
  DEFAULT_FIRST_REMINDER_DAYS,
  DEFAULT_REMINDER_INTERVAL_DAYS,
  ESCALATION_FROM_REMINDER,
  addDays,
  cents,
  isReminded,
  monthOf,
  needsJustification,
  nextStatus,
  overageOf,
  remainderOf,
  type DelaySettings,
} from "./justification-rules";

/**
 * Justificatifs après la remise des fonds (spec 078) : ouverture au dernier versement, dépôt des
 * factures, décision de la compta, reliquat, relances. Prisma, l'audit et les notifications sont
 * importés à l'appel.
 */

type Tx = Prisma.TransactionClient;

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string, churchId: string, entityId: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "FinancialJustification", entityId, details });
}

const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

// ── Réglages ─────────────────────────────────────────────────────────────────

export async function getJustificationSettings(churchId: string, client?: Tx): Promise<DelaySettings> {
  const prisma = client ?? (await db());
  const row = await prisma.financialJustificationSettings.findUnique({ where: { churchId } });
  return {
    firstReminderDays: row?.firstReminderDays ?? DEFAULT_FIRST_REMINDER_DAYS,
    reminderIntervalDays: row?.reminderIntervalDays ?? DEFAULT_REMINDER_INTERVAL_DAYS,
  };
}

export async function updateJustificationSettings(churchId: string, userId: string, input: DelaySettings) {
  const prisma = await db();
  const row = await prisma.financialJustificationSettings.upsert({
    where: { churchId },
    create: { churchId, ...input },
    update: input,
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action: "UPDATE", entityType: "FinancialJustificationSettings", entityId: churchId, details: { ...input } });
  return { firstReminderDays: row.firstReminderDays, reminderIntervalDays: row.reminderIntervalDays };
}

// ── Ouverture ────────────────────────────────────────────────────────────────

export interface OpenedJustification {
  id: string;
  submittedById: string;
  requestId: string;
  label: string;
  dueAt: Date;
}

/**
 * Appelée dans la transaction qui confirme un versement : quand plus aucune tranche n'attend,
 * ouvre la justification de la demande (ou rejoint celle de sa série pour le même mois). Renvoie
 * de quoi prévenir le demandeur après la transaction, ou `null` si rien n'est attendu.
 */
export async function openJustificationIfDue(
  requestId: string,
  tx: Tx,
  /** Réclamation de l'arriéré : l'échéance part de cette date, pas du dernier versement. */
  opts: { claimedAt?: Date } = {}
): Promise<OpenedJustification | null> {
  const request = await tx.financialRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      churchId: true,
      seriesId: true,
      type: true,
      label: true,
      submittedById: true,
      justificationId: true,
      overageOfJustificationId: true,
      department: { select: { function: true } },
      payments: { select: { amount: true, releasedAt: true, releasedAmount: true } },
      _count: { select: { attachments: true } },
      shuttleReimbursedEntry: { select: { id: true } },
      shuttleImportedEntry: { select: { id: true } },
    },
  });
  if (!request || request.justificationId || request.payments.length === 0) return null;
  if (request.payments.some((p) => p.releasedAt === null)) return null;
  const eligible = needsJustification({
    type: request.type,
    hasAttachment: request._count.attachments > 0,
    departmentFunction: request.department?.function ?? null,
    fromShuttle: !!(request.shuttleReimbursedEntry || request.shuttleImportedEntry),
    isOverage: !!request.overageOfJustificationId,
  });
  if (!eligible) return null;

  const released = cents(request.payments.reduce((s, p) => s + Number(p.releasedAmount ?? p.amount), 0));
  const lastRelease = new Date(Math.max(...request.payments.map((p) => p.releasedAt!.getTime())));
  const settings = await getJustificationSettings(request.churchId, tx);
  const dueAt = addDays(opts.claimedAt ?? lastRelease, settings.firstReminderDays);
  const month = monthOf(lastRelease);

  if (request.seriesId) {
    const existing = await tx.financialJustification.findFirst({
      where: { seriesId: request.seriesId, period: month, status: "AWAITING" },
    });
    if (existing) {
      const later = existing.dueAt > dueAt ? existing.dueAt : dueAt;
      await tx.financialJustification.update({
        where: { id: existing.id },
        data: {
          releasedAmount: cents(Number(existing.releasedAmount) + released),
          dueAt: later,
          nextReminderAt: existing.reminderCount === 0 ? later : existing.nextReminderAt,
          requests: { connect: { id: request.id } },
        },
      });
      return { id: existing.id, submittedById: request.submittedById, requestId: request.id, label: request.label, dueAt: later };
    }
  }

  const created = await tx.financialJustification.create({
    data: {
      churchId: request.churchId,
      seriesId: request.seriesId,
      period: request.seriesId ? month : null,
      releasedAmount: released,
      releasedMonth: month,
      dueAt,
      nextReminderAt: dueAt,
      requests: { connect: { id: request.id } },
    },
  });
  return { id: created.id, submittedById: request.submittedById, requestId: request.id, label: request.label, dueAt };
}

/**
 * La compta réclame les justificatifs d'une demande versée avant la mise en service du suivi
 * (arriéré) : même ouverture qu'au dernier versement, échéance comptée à partir d'aujourd'hui.
 */
export async function claimJustification(requestId: string, v: Viewer): Promise<OpenedJustification> {
  if (!v.manage) throw new ApiError(403, "Accès refusé");
  const prisma = await db();
  const opened = await prisma.$transaction(async (tx) => {
    const request = await tx.financialRequest.findUnique({ where: { id: requestId }, select: { churchId: true, justificationId: true } });
    if (request?.churchId !== v.churchId) throw new ApiError(404, "Demande introuvable");
    if (request.justificationId) throw new ApiError(400, "Les justificatifs de cette demande sont déjà demandés");
    const result = await openJustificationIfDue(requestId, tx, { claimedAt: new Date() });
    if (!result) throw new ApiError(400, "Cette demande n'attend pas de justificatif (pas entièrement versée, Navette, ou pièce déjà jointe)");
    return result;
  });
  await audit(v.userId, v.churchId, opened.id, { action: "claim", requestId });
  await notifyJustificationOpened(opened);
  return opened;
}

/** Prévient le demandeur que ses justificatifs sont attendus (hors transaction). */
export async function notifyJustificationOpened(opened: OpenedJustification): Promise<void> {
  const { createNotification } = await import("@/lib/notifications");
  await createNotification({
    userId: opened.submittedById,
    domain: "accounting",
    type: "ACCOUNTING_JUSTIFICATION_DUE",
    title: "Justificatifs attendus",
    message: `Déposez les factures de « ${opened.label} » avant le ${opened.dueAt.toLocaleDateString("fr-FR")}.`,
    link: `/accounting/requests/${opened.requestId}`,
  });
}

// ── Lecture ──────────────────────────────────────────────────────────────────

const DETAIL_INCLUDE = {
  requests: {
    select: {
      id: true,
      label: true,
      type: true,
      amount: true,
      submittedById: true,
      departmentId: true,
      occurrenceNumber: true,
      department: { select: { name: true } },
      submittedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  attachments: { select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true }, orderBy: { uploadedAt: "asc" as const } },
  overages: { select: { id: true, label: true, amount: true, status: true } },
  returnTreasuryAccount: { select: { id: true, name: true } },
} satisfies Prisma.FinancialJustificationInclude;

type JustificationRow = Prisma.FinancialJustificationGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export interface Viewer {
  userId: string;
  churchId: string;
  /** `accounting:manage` dans l'église. */
  manage: boolean;
  /** Départements visibles (`getAccountingDepartmentScope`), `null` = tous. */
  scope: string[] | null;
}

function submitterOf(j: Pick<JustificationRow, "requests">) {
  return j.requests[0]?.submittedById ?? null;
}

function canView(j: JustificationRow, v: Viewer): boolean {
  if (v.manage || v.scope === null) return true;
  return j.requests.some((r) => r.submittedById === v.userId || (r.departmentId !== null && v.scope!.includes(r.departmentId)));
}

function view(j: JustificationRow, v: Viewer, now = new Date()) {
  const released = Number(j.releasedAmount);
  const spent = j.spentAmount === null ? null : Number(j.spentAmount);
  return {
    id: j.id,
    status: j.status,
    period: j.period,
    seriesId: j.seriesId,
    releasedAmount: released,
    spentAmount: spent,
    remainder: spent === null ? null : remainderOf(released, spent),
    overage: spent === null ? null : overageOf(released, spent),
    dueAt: j.dueAt.toISOString(),
    late: j.status === "AWAITING" && j.dueAt <= now,
    reminderCount: j.reminderCount,
    submittedAt: j.submittedAt?.toISOString() ?? null,
    rejectionReason: j.rejectionReason,
    waiverReason: j.waiverReason,
    decidedAt: j.decidedAt?.toISOString() ?? null,
    returnedAmount: j.returnedAmount === null ? null : Number(j.returnedAmount),
    returnedAt: j.returnedAt?.toISOString() ?? null,
    returnAccount: j.returnTreasuryAccount,
    requests: j.requests.map((r) => ({
      id: r.id,
      label: r.label,
      type: r.type,
      amount: Number(r.amount),
      occurrenceNumber: r.occurrenceNumber,
      departmentId: r.departmentId,
      department: r.department?.name ?? null,
      submitter: r.submittedBy.name ?? r.submittedBy.email ?? "",
    })),
    attachments: j.attachments.map((a) => ({ ...a, uploadedAt: a.uploadedAt.toISOString() })),
    overages: j.overages.map((o) => ({ ...o, amount: Number(o.amount) })),
    isSubmitter: submitterOf(j) === v.userId,
    canManage: v.manage,
    expenseReport: j.requests.every((r) => r.type === "EXPENSE_REPORT"),
  };
}
export type JustificationView = ReturnType<typeof view>;

export async function getJustification(id: string, v: Viewer): Promise<JustificationView> {
  const prisma = await db();
  const j = await prisma.financialJustification.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (j?.churchId !== v.churchId || !canView(j, v)) throw new ApiError(404, "Justification introuvable");
  return view(j, v);
}

/** Justification d'une demande, si elle en a une et que le lecteur peut la voir. */
export async function getRequestJustification(requestId: string, v: Viewer): Promise<JustificationView | null> {
  const prisma = await db();
  const j = await prisma.financialJustification.findFirst({ where: { churchId: v.churchId, requests: { some: { id: requestId } } }, include: DETAIL_INCLUDE });
  return j && canView(j, v) ? view(j, v) : null;
}

export async function listJustifications(v: Viewer, filter: { status?: FinancialJustificationStatus; open?: boolean } = {}) {
  const prisma = await db();
  const scopeWhere: Prisma.FinancialJustificationWhereInput =
    v.manage || v.scope === null
      ? {}
      : { requests: { some: { OR: [{ submittedById: v.userId }, { departmentId: { in: v.scope } }] } } };
  const rows = await prisma.financialJustification.findMany({
    where: {
      churchId: v.churchId,
      ...scopeWhere,
      ...(filter.status ? { status: filter.status } : filter.open ? { status: { not: "SETTLED" } } : {}),
    },
    include: DETAIL_INCLUDE,
    orderBy: { dueAt: "asc" },
    take: 500,
  });
  const now = new Date();
  return rows.map((j) => view(j, v, now));
}

/** Compteurs de la compta : en attente, en retard, à vérifier, reliquats dus. */
export async function countOpenJustifications(churchId: string, now = new Date()) {
  const prisma = await db();
  const [awaiting, late, submitted, returnDue] = await Promise.all([
    prisma.financialJustification.count({ where: { churchId, status: "AWAITING" } }),
    prisma.financialJustification.count({ where: { churchId, status: "AWAITING", dueAt: { lte: now } } }),
    prisma.financialJustification.count({ where: { churchId, status: "SUBMITTED" } }),
    prisma.financialJustification.count({ where: { churchId, status: "RETURN_DUE" } }),
  ]);
  return { awaiting, late, submitted, returnDue };
}

// ── Gestes ───────────────────────────────────────────────────────────────────

async function loadForAction(id: string, v: Viewer, client: Pick<Tx, "financialJustification">) {
  const j = await client.financialJustification.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (j?.churchId !== v.churchId || !canView(j, v)) throw new ApiError(404, "Justification introuvable");
  return j;
}

async function notifySubmitter(j: JustificationRow, type: string, title: string, message: string) {
  const userId = submitterOf(j);
  if (!userId) return;
  const { createNotification } = await import("@/lib/notifications");
  await createNotification({ userId, domain: "accounting", type, title, message, link: `/accounting/requests/${j.requests[0].id}` });
}

const labelOf = (j: Pick<JustificationRow, "requests" | "period">) =>
  `${j.requests[0]?.label ?? "Demande"}${j.period ? ` (${j.period})` : ""}`;

/** Le demandeur dépose ses factures (cumulées) et déclare le montant total dépensé. */
export async function submitJustification(id: string, v: Viewer, input: { spentAmount: number; attachmentIds: string[] }) {
  const prisma = await db();
  const result = await prisma.$transaction(async (tx) => {
    const j = await loadForAction(id, v, tx);
    if (submitterOf(j) !== v.userId) throw new ApiError(403, "Seul le demandeur dépose ses justificatifs");
    const expenseReport = j.requests.every((r) => r.type === "EXPENSE_REPORT");
    const spent = expenseReport ? Number(j.releasedAmount) : cents(input.spentAmount);
    const status = nextStatus(j.status, "submit", { released: Number(j.releasedAmount), spent });
    const newIds = [...new Set(input.attachmentIds)].filter((a) => !j.attachments.some((x) => x.id === a));
    if (j.attachments.length + newIds.length === 0) throw new ApiError(400, "Ajoutez au moins une facture");
    await assertAttachmentsAssignable(newIds, { userId: v.userId, churchId: v.churchId }, tx);
    if (newIds.length) await tx.financialAttachment.updateMany({ where: { id: { in: newIds } }, data: { justificationId: id } });
    await tx.financialJustification.update({
      where: { id },
      data: { status, spentAmount: spent, submittedAt: new Date(), rejectionReason: null },
    });
    return { j, spent, added: newIds.length };
  });
  await audit(v.userId, v.churchId, id, { action: "submit", spentAmount: result.spent, attachmentsAdded: result.added });
  const { notifyUsersWithRole } = await import("@/lib/notifications");
  await notifyUsersWithRole(v.churchId, "ACCOUNTANT", {
    domain: "accounting",
    type: "ACCOUNTING_JUSTIFICATION_SUBMITTED",
    title: "Justificatifs à vérifier",
    message: `${labelOf(result.j)} : ${fmt(result.spent)} dépensés.`,
    link: `/accounting/requests/${result.j.requests[0].id}`,
  });
  return getJustification(id, v);
}

/** La compta accepte les factures, ou les renvoie avec un motif (les relances reprennent). */
export async function reviewJustification(id: string, v: Viewer, decision: { accept: boolean; reason?: string | null }) {
  if (!v.manage) throw new ApiError(403, "Accès refusé");
  const prisma = await db();
  const settings = await getJustificationSettings(v.churchId);
  const now = new Date();
  const j = await loadForAction(id, v, prisma);
  const amounts = { released: Number(j.releasedAmount), spent: j.spentAmount === null ? null : Number(j.spentAmount) };
  const status = nextStatus(j.status, decision.accept ? "accept" : "reject", amounts);
  if (!decision.accept && !decision.reason?.trim()) throw new ApiError(400, "Le motif est obligatoire");
  await prisma.financialJustification.update({
    where: { id },
    data: decision.accept
      ? { status, decidedById: v.userId, decidedAt: now, nextReminderAt: addDays(now, settings.reminderIntervalDays) }
      : { status, rejectionReason: decision.reason!.trim(), nextReminderAt: addDays(now, settings.reminderIntervalDays) },
  });
  await audit(v.userId, v.churchId, id, decision.accept ? { action: "accept", status } : { action: "reject", reason: decision.reason });
  if (decision.accept) {
    const remainder = remainderOf(amounts.released, amounts.spent ?? 0);
    await notifySubmitter(
      j,
      "ACCOUNTING_JUSTIFICATION_ACCEPTED",
      "Justificatifs acceptés",
      remainder > 0 ? `${labelOf(j)} : reliquat de ${fmt(remainder)} à rendre à la comptabilité.` : `${labelOf(j)} : la demande est soldée.`
    );
  } else {
    await notifySubmitter(j, "ACCOUNTING_JUSTIFICATION_REJECTED", "Justificatifs à reprendre", `${labelOf(j)} : ${decision.reason!.trim()}`);
  }
  return getJustification(id, v);
}

/** La compta dispense de justificatif (facture perdue…), avec un motif et le montant retenu. */
export async function waiveJustification(id: string, v: Viewer, input: { reason: string; retainedAmount: number }) {
  if (!v.manage) throw new ApiError(403, "Accès refusé");
  const prisma = await db();
  const settings = await getJustificationSettings(v.churchId);
  const now = new Date();
  const j = await loadForAction(id, v, prisma);
  const released = Number(j.releasedAmount);
  const retained = cents(input.retainedAmount);
  if (retained > released) throw new ApiError(400, "Le montant retenu ne dépasse pas le montant versé");
  const status = nextStatus(j.status, "waive", { released, spent: retained });
  await prisma.financialJustification.update({
    where: { id },
    data: {
      status,
      spentAmount: retained,
      waiverReason: input.reason.trim(),
      decidedById: v.userId,
      decidedAt: now,
      nextReminderAt: addDays(now, settings.reminderIntervalDays),
    },
  });
  await audit(v.userId, v.churchId, id, { action: "waive", reason: input.reason, retainedAmount: retained });
  const remainder = remainderOf(released, retained);
  await notifySubmitter(
    j,
    "ACCOUNTING_JUSTIFICATION_WAIVED",
    "Justificatif dispensé",
    remainder > 0 ? `${labelOf(j)} : reliquat de ${fmt(remainder)} à rendre à la comptabilité.` : `${labelOf(j)} : la demande est soldée.`
  );
  return getJustification(id, v);
}

/**
 * La compta confirme la restitution du reliquat. Le compte de trésorerie est validé par la route
 * (actif, mois ouvert), seule couche qui importe la trésorerie (ADR-0027) ; `null` = compte commun.
 */
export async function recordReturn(id: string, v: Viewer, input: { returnedAt: Date; treasuryAccountId: string | null }) {
  if (!v.manage) throw new ApiError(403, "Accès refusé");
  const prisma = await db();
  const j = await loadForAction(id, v, prisma);
  const released = Number(j.releasedAmount);
  const spent = j.spentAmount === null ? released : Number(j.spentAmount);
  const status = nextStatus(j.status, "return", { released, spent });
  const amount = remainderOf(released, spent);
  await prisma.financialJustification.update({
    where: { id },
    data: { status, returnedAmount: amount, returnedAt: input.returnedAt, returnedById: v.userId, returnTreasuryAccountId: input.treasuryAccountId },
  });
  await audit(v.userId, v.churchId, id, { action: "return", amount, treasuryAccountId: input.treasuryAccountId });
  await notifySubmitter(j, "ACCOUNTING_JUSTIFICATION_SETTLED", "Demande soldée", `${labelOf(j)} : reliquat de ${fmt(amount)} bien reçu.`);
  return getJustification(id, v);
}

/** Justification qu'une note de frais liée peut compléter : celle du demandeur, avec un dépassement. */
export async function assertOverageAllowed(justificationId: string, v: Viewer) {
  const j = await getJustification(justificationId, v);
  if (!j.isSubmitter) throw new ApiError(403, "Seul le demandeur demande le complément");
  if (!j.overage || j.overage <= 0) throw new ApiError(400, "Aucun dépassement à compléter");
  const asked = j.overages.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED").reduce((s, o) => s + o.amount, 0);
  return { justification: j, remaining: cents(j.overage - asked) };
}

// ── Relances (tâche planifiée) ───────────────────────────────────────────────

/**
 * Relance le demandeur à l'échéance puis à intervalle régulier, tant que les justificatifs
 * manquent ou que le reliquat n'est pas rendu. Dès la 3e relance, prévient aussi les responsables
 * du département (principal et adjoints) et le Ministre de son ministère. Idempotente : chaque
 * relance prend l'échéance de façon atomique.
 */
export async function runJustificationReminders(now = new Date()) {
  const prisma = await db();
  const { notifyUsers } = await import("@/lib/notifications");
  const due = await prisma.financialJustification.findMany({
    where: { status: { in: ["AWAITING", "RETURN_DUE"] }, nextReminderAt: { lte: now } },
    include: DETAIL_INCLUDE,
    take: 200,
  });
  let sent = 0;
  let escalated = 0;
  for (const j of due) {
    if (!isReminded(j.status)) continue;
    const settings = await getJustificationSettings(j.churchId);
    const claim = await prisma.financialJustification.updateMany({
      where: { id: j.id, status: j.status, nextReminderAt: j.nextReminderAt },
      data: { nextReminderAt: addDays(now, settings.reminderIntervalDays), reminderCount: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    const count = j.reminderCount + 1;
    const submitter = submitterOf(j);
    const link = `/accounting/requests/${j.requests[0].id}`;
    const remainder = remainderOf(Number(j.releasedAmount), Number(j.spentAmount ?? j.releasedAmount));
    const message =
      j.status === "RETURN_DUE"
        ? `${labelOf(j)} : reliquat de ${fmt(remainder)} à rendre à la comptabilité.`
        : `${labelOf(j)} : factures attendues depuis le ${j.dueAt.toLocaleDateString("fr-FR")}.`;
    const active = submitter
      ? await prisma.userChurchRole.findFirst({ where: { userId: submitter, churchId: j.churchId }, select: { id: true } })
      : null;
    if (submitter && active) {
      await notifyUsers([submitter], { domain: "accounting", type: "ACCOUNTING_JUSTIFICATION_REMINDER", title: "Relance : justificatifs", message, link });
      sent++;
    }
    const departmentId = j.requests.find((r) => r.departmentId)?.departmentId ?? null;
    if (count >= ESCALATION_FROM_REMINDER && departmentId) {
      const leads = await responsiblesOf(departmentId, j.churchId);
      const others = leads.filter((u) => u !== submitter);
      if (others.length) {
        await notifyUsers(others, {
          domain: "accounting",
          type: "ACCOUNTING_JUSTIFICATION_ESCALATION",
          title: "Justificatifs en retard",
          message: `${count}e relance — ${message}`,
          link,
        });
        escalated++;
      }
    }
  }
  return { sent, escalated };
}

/** Responsables (principal et adjoints) d'un département et Ministre de son ministère. */
async function responsiblesOf(departmentId: string, churchId: string): Promise<string[]> {
  const prisma = await db();
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { ministryId: true } });
  const [heads, ministers] = await Promise.all([
    prisma.userDepartment.findMany({ where: { departmentId, userChurchRole: { churchId } }, select: { userChurchRole: { select: { userId: true } } } }),
    department
      ? prisma.userChurchRole.findMany({ where: { churchId, role: "MINISTER", ministryId: department.ministryId }, select: { userId: true } })
      : Promise.resolve([]),
  ]);
  return [...new Set([...heads.map((h) => h.userChurchRole.userId), ...ministers.map((m) => m.userId)])];
}
