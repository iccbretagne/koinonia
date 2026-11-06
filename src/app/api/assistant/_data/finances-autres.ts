import { boundedAnswer } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { anonymize } from "@/modules/assistant";
import { REFUSED, can, formatDay, formatEuros, formatTime, paramsSchema, type DataQuestion } from "./common";

/**
 * Questions de données de la billetterie (D08), des salles (D10), de la comptabilité (D18, D19,
 * D23), de la navette (D20) et de la trésorerie (D21, D22). Chaque module est chargé à la
 * demande : la composition (`_data-questions.ts`) ne propose ces questions que si le module est
 * actif.
 */

const REQUEST_STATUS: Record<string, string> = {
  SUBMITTED: "Soumise",
  PROCESSING: "En cours de traitement",
  APPROVED: "Validée",
};

export const TICKETING_QUESTIONS: DataQuestion[] = [
  {
    key: "ticketing.myAssignments",
    description: "Affectations de la personne à l'équipe d'événements de billetterie : poste et créneau.",
    params: paramsSchema,
    async run({ viewer }) {
      const { listAssignmentsForUser } = await import("@/modules/ticketing");
      const assignments = await listAssignmentsForUser(viewer.userId);
      const items = assignments.map((a) => {
        const start = new Date(a.startsAt ?? a.event.startsAt);
        return {
          label: `${formatDay(start)} ${formatTime(start)} · ${a.event.title}`,
          detail: a.postName ?? "Équipe",
        };
      });
      return boundedAnswer({
        title: "Mes affectations",
        href: "/planning",
        hrefLabel: "Mon planning",
        items,
        empty: "Vous n'êtes affecté à aucune équipe d'événement à venir.",
      });
    },
  },
];

export const ROOMS_QUESTIONS: DataQuestion[] = [
  {
    key: "rooms.myReservations",
    description: "Réservations de salle à venir faites par la personne dans l'église courante.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "rooms:reserve")) return REFUSED;
      const reservations = await prisma.roomReservation.findMany({
        where: {
          churchId,
          createdById: viewer.userId,
          status: "CONFIRMED",
          isRecurrenceParent: false,
          endAt: { gte: new Date() },
        },
        select: { title: true, startAt: true, endAt: true, room: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      });
      const items = reservations.map((r) => ({
        label: `${formatDay(r.startAt)} ${formatTime(r.startAt)}–${formatTime(r.endAt)} · ${r.room.name}`,
        detail: anonymize(r.title, 120),
      }));
      return boundedAnswer({
        title: "Mes réservations",
        href: "/rooms",
        hrefLabel: "Salles",
        items,
        empty: "Vous n'avez aucune réservation à venir.",
      });
    },
  },
];

export const ACCOUNTING_QUESTIONS: DataQuestion[] = [
  {
    key: "accounting.toValidate",
    description: "Demandes financières de l'église à valider : nombre et montant total.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "accounting:manage")) return REFUSED;
      const requests = await prisma.financialRequest.findMany({
        where: { churchId, status: { in: ["SUBMITTED", "PROCESSING"] } },
        select: { label: true, amount: true, status: true, department: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      });
      const total = requests.reduce((s, r) => s + Number(r.amount), 0);
      const items = requests.map((r) => ({
        label: `${anonymize(r.label, 120)} · ${formatEuros(Number(r.amount))}`,
        detail: `${r.department?.name ?? "Demande personnelle"} · ${REQUEST_STATUS[r.status] ?? r.status}`,
      }));
      return boundedAnswer({
        title: requests.length > 0 ? `À valider : ${requests.length} (${formatEuros(total)})` : "Demandes à valider",
        href: "/accounting/requests",
        hrefLabel: "Comptabilité",
        items,
        empty: "Aucune demande financière à valider.",
      });
    },
  },
  {
    key: "accounting.awaitingPayment",
    description: "Tranches de paiement validées pas encore versées : montant total et échéances.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "accounting:manage")) return REFUSED;
      const payments = await prisma.financialPayment.findMany({
        where: { releasedAt: null, request: { churchId, status: "APPROVED" } },
        select: { amount: true, scheduledDate: true, request: { select: { label: true } } },
        orderBy: { scheduledDate: "asc" },
      });
      const total = payments.reduce((s, p) => s + Number(p.amount), 0);
      const items = payments.map((p) => ({
        label: `${formatDay(p.scheduledDate)} · ${formatEuros(Number(p.amount))}`,
        detail: anonymize(p.request.label, 120),
      }));
      return boundedAnswer({
        title: payments.length > 0 ? `En attente de paiement : ${formatEuros(total)}` : "Paiements en attente",
        href: "/accounting/requests",
        hrefLabel: "Comptabilité",
        items,
        empty: "Aucun paiement en attente.",
      });
    },
  },
  {
    key: "accounting.myRequests",
    description: "Demandes financières de la personne encore en cours et état de leur paiement.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "accounting:submit") && !viewer.predicates.includes("pastoral")) return REFUSED;
      const requests = await prisma.financialRequest.findMany({
        where: { churchId, submittedById: viewer.userId, status: { in: ["SUBMITTED", "PROCESSING", "APPROVED"] } },
        select: { label: true, amount: true, status: true, payments: { select: { releasedAt: true } } },
        orderBy: { createdAt: "desc" },
      });
      const open = requests.filter((r) => r.status !== "APPROVED" || r.payments.some((p) => !p.releasedAt));
      const items = open.map((r) => {
        const pending = r.payments.filter((p) => !p.releasedAt).length;
        const detail =
          r.status === "APPROVED"
            ? `Validée · ${pending} versement${pending > 1 ? "s" : ""} à venir`
            : (REQUEST_STATUS[r.status] ?? r.status);
        return { label: `${anonymize(r.label, 120)} · ${formatEuros(Number(r.amount))}`, detail };
      });
      return boundedAnswer({
        title: "Mes demandes financières",
        href: "/accounting/requests",
        hrefLabel: "Comptabilité",
        items,
        empty: "Vous n'avez aucune demande financière en cours.",
      });
    },
  },
];

export const SHUTTLE_QUESTIONS: DataQuestion[] = [
  {
    key: "shuttle.balance",
    description: "Solde à date de la navette (équipe navette et comptabilité).",
    params: paramsSchema,
    async run({ session, churchId }) {
      const { currentBalance, getShuttleAccess } = await import("@/modules/shuttle");
      const access = await getShuttleAccess(session, churchId);
      if (!access.manager && !access.member) return REFUSED;
      const balance = await currentBalance(churchId);
      return boundedAnswer({
        title: "Navette",
        href: "/accounting/navette",
        hrefLabel: "Navette",
        items: [{ label: `Solde à date : ${formatEuros(balance)}` }],
      });
    },
  },
];

export const TREASURY_QUESTIONS: DataQuestion[] = [
  {
    key: "treasury.balances",
    description: "Solde de chaque compte de trésorerie et total, à date.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "treasury:manage")) return REFUSED;
      const { getDashboard } = await import("@/modules/treasury");
      const dashboard = await getDashboard(churchId);
      const items = dashboard.accounts.map((a) => ({ label: a.name, detail: formatEuros(a.balance) }));
      return boundedAnswer({
        title: `Trésorerie : ${formatEuros(dashboard.total)}`,
        href: "/accounting/tresorerie",
        hrefLabel: "Trésorerie",
        items,
        empty: "Aucun compte de trésorerie n'est encore ouvert.",
      });
    },
  },
  {
    key: "treasury.chequesInHand",
    description: "Chèques encore en caisse (non remis au compte commun) : nombre et montant, par compte.",
    params: paramsSchema,
    async run({ viewer, churchId }) {
      if (!can(viewer, "treasury:manage")) return REFUSED;
      const { listChequesInHand } = await import("@/modules/treasury");
      const cheques = await listChequesInHand(churchId);
      const byAccount = new Map<string, { count: number; amount: number }>();
      for (const c of cheques) {
        const row = byAccount.get(c.accountName) ?? { count: 0, amount: 0 };
        row.count += c.count;
        row.amount += c.amount;
        byAccount.set(c.accountName, row);
      }
      const count = cheques.reduce((s, c) => s + c.count, 0);
      const amount = cheques.reduce((s, c) => s + c.amount, 0);
      const items = [...byAccount.entries()].map(([name, row]) => ({
        label: name,
        detail: `${row.count} chèque${row.count > 1 ? "s" : ""} · ${formatEuros(row.amount)}`,
      }));
      return boundedAnswer({
        title: count > 0 ? `Chèques en caisse : ${count} (${formatEuros(amount)})` : "Chèques en caisse",
        href: "/accounting/tresorerie?onglet=remise",
        hrefLabel: "Trésorerie › Remise",
        items,
        empty: "Aucun chèque en caisse.",
      });
    },
  },
];
