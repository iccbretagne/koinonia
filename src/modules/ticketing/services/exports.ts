import {
  AGE_GROUP_LABEL,
  CHARGE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  readQuestions,
  type ExportType,
} from "../schemas";
import { listBookings, listPayments } from "./payments";

/**
 * Exports Excel de la billetterie (spec 074) : participants, règlements, remboursements,
 * récapitulatif des options ; registre des passages (lot 2).
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;

const KIND_LABEL = { DECLARATION: "Déclaration", RECEIPT: "Encaissement", REFUND: "Remboursement" } as const;
const PAYMENT_STATUS_LABEL = { PENDING: "À confirmer", CONFIRMED: "Confirmé", REJECTED: "Refusé" } as const;

function sheet(wb: Workbook, name: string, columns: { header: string; key: string; width: number }[]): Worksheet {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  return ws;
}

async function participantsSheet(wb: Workbook, eventId: string) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { questions: true } });
  const questions = readQuestions(event.questions);
  const ws = sheet(wb, "Participants", [
    { header: "Référence", key: "reference", width: 12 },
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Tranche d'âge", key: "age", width: 14 },
    { header: "État", key: "status", width: 10 },
    { header: "Entrée (€)", key: "entry", width: 11 },
    { header: "Paiement entrée", key: "entryStatus", width: 15 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "Email", key: "email", width: 28 },
    { header: "Téléphone", key: "phone", width: 16 },
    { header: "Responsable légal", key: "guardian", width: 28 },
    ...questions.map((q) => ({ header: q.label, key: `q_${q.id}`, width: 24 })),
  ]);
  for (const b of await listBookings(eventId, true)) {
    for (const p of b.participants) {
      ws.addRow({
        reference: b.reference,
        firstName: p.firstName,
        lastName: p.lastName,
        age: AGE_GROUP_LABEL[p.ageGroup],
        status: p.status === "ACTIVE" ? "Actif" : "Annulé",
        entry: p.entryPrice,
        entryStatus: CHARGE_STATUS_LABEL[p.entryStatus],
        contact: b.contact.name,
        email: b.contact.email,
        phone: b.contact.phone,
        guardian: b.guardian ? `${b.guardian.name} — ${b.guardian.phone ?? ""}` : "",
        ...Object.fromEntries(questions.map((q) => [`q_${q.id}`, b.answers[q.id] ?? ""])),
      });
    }
  }
}

async function paymentsSheet(wb: Workbook, eventId: string, refundsOnly: boolean) {
  const ws = sheet(wb, refundsOnly ? "Remboursements" : "Règlements", [
    { header: "Date", key: "date", width: 18 },
    { header: "Référence", key: "reference", width: 12 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "Nature", key: "kind", width: 16 },
    { header: "Moyen", key: "method", width: 12 },
    { header: "Montant (€)", key: "amount", width: 12 },
    { header: "État", key: "status", width: 12 },
    { header: "Motif", key: "reason", width: 30 },
  ]);
  for (const p of await listPayments(eventId)) {
    if (refundsOnly && p.kind !== "REFUND") continue;
    ws.addRow({
      date: p.createdAt.slice(0, 16).replace("T", " "),
      reference: p.reference,
      contact: p.contactName,
      kind: KIND_LABEL[p.kind],
      method: PAYMENT_METHOD_LABEL[p.method],
      amount: p.amount,
      status: PAYMENT_STATUS_LABEL[p.status],
      reason: p.reason ?? "",
    });
  }
  if (refundsOnly) {
    const due = sheet(wb, "À rembourser", [
      { header: "Référence", key: "reference", width: 12 },
      { header: "Contact", key: "contact", width: 22 },
      { header: "Email", key: "email", width: 28 },
      { header: "Élément", key: "label", width: 36 },
      { header: "Montant (€)", key: "amount", width: 12 },
    ]);
    for (const b of await listBookings(eventId, true)) {
      for (const c of b.charges.filter((x) => x.status === "REFUND_DUE")) {
        due.addRow({ reference: b.reference, contact: b.contact.name, email: b.contact.email, label: c.label, amount: c.amount });
      }
    }
  } else {
    const balances = sheet(wb, "Soldes", [
      { header: "Référence", key: "reference", width: 12 },
      { header: "Contact", key: "contact", width: 22 },
      { header: "Total (€)", key: "total", width: 11 },
      { header: "Payé (€)", key: "paid", width: 11 },
      { header: "Déclaré (€)", key: "declared", width: 12 },
      { header: "Reste (€)", key: "due", width: 11 },
      { header: "À rembourser (€)", key: "refundDue", width: 16 },
    ]);
    for (const b of await listBookings(eventId, true)) {
      balances.addRow({ reference: b.reference, contact: b.contact.name, ...b.balances });
    }
  }
}

async function optionsSheet(wb: Workbook, eventId: string) {
  const prisma = await db();
  const options = await prisma.ticketingOption.findMany({
    where: { eventId },
    orderBy: { position: "asc" },
    include: { variants: { orderBy: { position: "asc" } }, items: { where: { cancelledAt: null, status: { notIn: ["RELEASED", "CANCELLED"] } } } },
  });
  const ws = sheet(wb, "Options", [
    { header: "Option", key: "option", width: 28 },
    { header: "Variante", key: "variant", width: 24 },
    { header: "Réservés", key: "reserved", width: 10 },
    { header: "Payés", key: "paid", width: 10 },
    { header: "À régler / déclarés", key: "unpaid", width: 18 },
    { header: "Stock", key: "stock", width: 8 },
  ]);
  for (const o of options) {
    const groups = o.variants.length > 0 ? o.variants.map((v) => ({ label: v.label, stock: v.stock, items: o.items.filter((i) => i.variantId === v.id) })) : [{ label: "", stock: o.stock, items: o.items }];
    for (const g of groups) {
      const qty = (pred: (s: string) => boolean) => g.items.filter((i) => pred(i.status)).reduce((n, i) => n + i.quantity, 0);
      ws.addRow({
        option: o.label,
        variant: g.label,
        reserved: qty(() => true),
        paid: qty((s) => s === "PAID" || s === "FREE"),
        unpaid: qty((s) => s === "DUE" || s === "DECLARED"),
        stock: g.stock ?? "",
      });
    }
  }
}

async function passagesSheet(wb: Workbook, eventId: string) {
  const prisma = await db();
  const passages = await prisma.ticketingPassage.findMany({
    where: { eventId },
    orderBy: { scannedAt: "asc" },
    include: { participant: { select: { firstName: true, lastName: true } }, assignment: { select: { guestName: true, user: { select: { name: true } } } } },
  });
  const ws = sheet(wb, "Passages", [
    { header: "Heure", key: "at", width: 20 },
    { header: "Sens", key: "direction", width: 8 },
    { header: "Personne", key: "who", width: 28 },
    { header: "Catégorie", key: "subject", width: 12 },
    { header: "Nombre", key: "delta", width: 8 },
    { header: "Motif", key: "reason", width: 24 },
    { header: "Porte", key: "gate", width: 14 },
    { header: "Anomalie", key: "anomaly", width: 10 },
  ]);
  for (const p of passages) {
    let who = "";
    if (p.participant) who = `${p.participant.firstName} ${p.participant.lastName}`;
    else if (p.assignment) who = p.assignment.user?.name ?? p.assignment.guestName ?? "";
    ws.addRow({
      at: p.scannedAt.toISOString().slice(0, 19).replace("T", " "),
      direction: p.direction === "IN" ? "Entrée" : "Sortie",
      who,
      subject: { PARTICIPANT: "Participant", STAFF: "Équipe", MANUAL: "Comptage" }[p.subject],
      delta: p.delta,
      reason: p.reason ?? "",
      gate: p.gate ?? "",
      anomaly: p.anomaly ? "Oui" : "",
    });
  }
}

/** Classeur Excel de l'export demandé. */
export async function buildTicketingExport(eventId: string, type: ExportType): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  if (type === "participants") await participantsSheet(wb, eventId);
  else if (type === "payments") await paymentsSheet(wb, eventId, false);
  else if (type === "refunds") await paymentsSheet(wb, eventId, true);
  else if (type === "options") await optionsSheet(wb, eventId);
  else await passagesSheet(wb, eventId);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
