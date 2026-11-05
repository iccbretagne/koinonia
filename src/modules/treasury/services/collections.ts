import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import type { CollectionInput } from "../schemas";
import { getActiveTreasuryAccount } from "./accounts";
import { assertOpen } from "./closures";
import { audit, cents, dayLabel, db, euros, fromIsoDate, toIsoDate, type TreasuryActor } from "./common";
import { ensureDefaults } from "./defaults";

/**
 * Collecte d'un culte (spec 076) : par catégorie, le total en espèces et les chèques (un par un
 * ou en total), comptés par deux personnes. Enregistrée en une transaction : une ligne
 * « Espèces » et une ligne « Chèque » par catégorie, plus les chèques en caisse.
 */

/** Cultes de l'église autour d'une date (±7 jours), pour choisir la collecte. */
export async function listCollectionServices(churchId: string, around = new Date()) {
  const prisma = await db();
  const from = new Date(around.getTime() - 7 * 86_400_000);
  const to = new Date(around.getTime() + 7 * 86_400_000);
  const events = await prisma.event.findMany({
    where: { churchId, type: "CULTE", date: { gte: from, lte: to } },
    select: { id: true, title: true, date: true },
    orderBy: { date: "desc" },
  });
  return events.map((e) => ({ id: e.id, title: e.title, date: toIsoDate(e.date) }));
}

export async function createCollection(churchId: string, input: CollectionInput, actor: TreasuryActor) {
  await ensureDefaults(churchId);
  await assertOpen(churchId, input.date);
  const account = await getActiveTreasuryAccount(churchId, input.accountId);
  if (input.date < toIsoDate(account.openingDate)) {
    throw new ApiError(400, "La date est antérieure au solde de départ de ce compte");
  }
  const prisma = await db();

  const event = input.eventId
    ? await prisma.event.findFirst({ where: { id: input.eventId, churchId }, select: { id: true, title: true } })
    : null;
  if (input.eventId && !event) throw new ApiError(400, "Culte introuvable");

  const categoryIds = [...new Set(input.lines.map((l) => l.categoryId))];
  const categories = await prisma.treasuryCategory.findMany({ where: { id: { in: categoryIds }, churchId } });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const purposeIds = input.lines.flatMap((l) => (l.purposeId ? [l.purposeId] : []));
  const purposes = await prisma.treasuryPurpose.findMany({ where: { id: { in: purposeIds }, churchId, active: true } });
  const purposeSet = new Set(purposes.map((p) => p.id));
  for (const line of input.lines) {
    const category = byId.get(line.categoryId);
    if (!category || !category.active || category.direction !== "IN") throw new ApiError(400, "Catégorie d'entrée introuvable ou désactivée");
    if (category.system === "SPECIAL_OFFERING" && (!line.purposeId || !purposeSet.has(line.purposeId))) {
      throw new ApiError(400, "Indiquez l'objet de chaque offrande spéciale");
    }
    if (category.system && category.system !== "SPECIAL_OFFERING") throw new ApiError(400, `« ${category.name} » ne se saisit pas dans une collecte`);
  }

  const label = event ? `Collecte · ${event.title}` : `Collecte du culte du ${dayLabel(input.date)}`;
  const date = fromIsoDate(input.date);

  // Identifiants posés à l'avance : lignes et chèques s'écrivent en deux insertions groupées.
  const collectionId = randomUUID();
  const entries: Prisma.TreasuryEntryCreateManyInput[] = [];
  const cheques: Prisma.TreasuryChequeCreateManyInput[] = [];
  for (const line of input.lines) {
    const category = byId.get(line.categoryId)!;
    const common = {
      churchId,
      accountId: account.id,
      direction: "IN" as const,
      categoryId: category.id,
      purposeId: category.system === "SPECIAL_OFFERING" ? line.purposeId : null,
      date,
      label,
      collectionId,
      createdById: actor.id,
      updatedById: actor.id,
    };
    if (line.cash > 0) entries.push({ ...common, id: randomUUID(), method: "CASH", amount: line.cash });
    if (line.cheques.length > 0) {
      const id = randomUUID();
      const total = line.cheques.reduce((s, c) => s + cents(c.amount), 0);
      entries.push({ ...common, id, method: "CHEQUE", amount: euros(total) });
      cheques.push(...line.cheques.map((c) => ({ churchId, entryId: id, number: c.number, amount: c.amount, count: c.count })));
    }
  }

  await prisma.$transaction([
    prisma.treasuryCollection.create({
      data: {
        id: collectionId,
        churchId,
        accountId: account.id,
        eventId: event?.id ?? null,
        date,
        counter1: input.counter1,
        counter2: input.counter2,
        createdById: actor.id,
      },
    }),
    prisma.treasuryEntry.createMany({ data: entries }),
    prisma.treasuryCheque.createMany({ data: cheques }),
  ]);
  const result = { collection: { id: collectionId }, entryIds: entries.map((e) => e.id!) };

  await audit(churchId, actor, "CREATE", "TreasuryCollection", result.collection.id, {
    date: input.date,
    accountId: account.id,
    counters: [input.counter1, input.counter2],
    lines: input.lines.map((l) => ({
      categoryId: l.categoryId,
      purposeId: l.purposeId,
      cash: l.cash,
      cheques: l.cheques.length,
      chequesTotal: euros(l.cheques.reduce((s, c) => s + cents(c.amount), 0)),
    })),
  });
  return { id: result.collection.id, entryIds: result.entryIds };
}
