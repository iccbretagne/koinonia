import type { Prisma } from "@/generated/prisma/client";

/**
 * Liste d'attente (spec 079, lot 2). Une seule règle, appelée après tout ce qui peut libérer une
 * place (annulation, refus, offre expirée, modification d'une réponse, places ajoutées) : les
 * personnes en attente, **dans l'ordre d'arrivée**, se voient proposer la place quand tout ce
 * qu'elles ont retenu (niveau, choix limités) a de la place. Une place proposée est tenue
 * (`OFFERED`) jusqu'à la réponse ou à l'expiration (`offerHoldHours`).
 *
 * Appelée dans la transaction de l'appelant, après le verrou du formulaire. Renvoie les réponses
 * à qui une place vient d'être proposée (à prévenir une fois la transaction validée).
 */

type Tx = Prisma.TransactionClient;

const HOLDING = ["CONFIRMED", "OFFERED"] as const;

export async function fillOpenPlaces(tx: Tx, formId: string, now = new Date()): Promise<string[]> {
  const form = await tx.form.findUnique({
    where: { id: formId },
    select: {
      status: true,
      deletedAt: true,
      offerHoldHours: true,
      questions: { select: { choices: { select: { id: true, capacity: true } } } },
      sessions: { select: { levels: { select: { id: true, capacity: true } } } },
    },
  });
  if (!form || form.status !== "PUBLISHED" || form.deletedAt) return [];

  const waiting = await tx.formResponse.findMany({
    where: { formId, status: "WAITLISTED" },
    select: { id: true, levelId: true, choices: { select: { choiceId: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (waiting.length === 0) return [];

  const capacity = new Map<string, number>();
  for (const q of form.questions) for (const c of q.choices) if (c.capacity != null) capacity.set(c.id, c.capacity);
  for (const s of form.sessions) for (const l of s.levels) capacity.set(l.id, l.capacity);

  const [byChoice, byLevel] = await Promise.all([
    tx.formResponseChoice.groupBy({ by: ["choiceId"], where: { response: { formId, status: { in: [...HOLDING] } } }, _count: { _all: true } }),
    tx.formResponse.groupBy({ by: ["levelId"], where: { formId, levelId: { not: null }, status: { in: [...HOLDING] } }, _count: { _all: true } }),
  ]);
  const held = new Map<string, number>();
  for (const r of byChoice) held.set(r.choiceId, r._count._all);
  for (const r of byLevel) held.set(r.levelId!, r._count._all);

  const offered: string[] = [];
  const expiresAt = new Date(now.getTime() + form.offerHoldHours * 3_600_000);
  for (const response of waiting) {
    const slots = [...response.choices.map((c) => c.choiceId), ...(response.levelId ? [response.levelId] : [])].filter((id) => capacity.has(id));
    if (!slots.every((id) => (held.get(id) ?? 0) < capacity.get(id)!)) continue;
    await tx.formResponse.update({ where: { id: response.id }, data: { status: "OFFERED", offerExpiresAt: expiresAt } });
    for (const id of slots) held.set(id, (held.get(id) ?? 0) + 1);
    offered.push(response.id);
  }
  return offered;
}
