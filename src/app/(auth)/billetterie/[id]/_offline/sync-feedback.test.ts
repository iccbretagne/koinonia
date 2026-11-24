import { describe, expect, it } from "vitest";
import type { SyncOp } from "@/modules/ticketing/schemas";
import { memoryStore, opQueue } from "@/lib/offline/store";
import { deliveryFeedback, settleFieldSync } from "./sync-feedback";

function delivery(id: string, itemId: string): SyncOp {
  return { id, itemId, type: "delivery", delivered: 1, scannedAt: new Date() };
}

describe("suivi de la distribution hors ligne", () => {
  it("distingue la file locale, les remises confirmées et celles refusées dans le même lot", () => {
    const ops = [delivery("a", "meal-a"), delivery("b", "meal-b"), delivery("c", "meal-c")];
    const pending = deliveryFeedback({}, ops);
    expect(pending["meal-a"]).toEqual({ status: "pending" });
    const result = deliveryFeedback(pending, ops, [
      { id: "a", status: "rejected", reason: "Élément annulé ou libéré" },
      { id: "b", status: "applied" },
    ]);
    expect(result).toEqual({
      "meal-a": { status: "rejected", reason: "Élément annulé ou libéré" },
      "meal-b": { status: "delivered" },
      "meal-c": { status: "pending" },
    });
    const retry = delivery("retry-a", "meal-a");
    const retried = deliveryFeedback(result, [retry]);
    expect(retried["meal-a"]).toEqual({ status: "pending" });
    expect(deliveryFeedback(retried, [retry], [{ id: "retry-a", status: "duplicate" }])["meal-a"]).toEqual({ status: "delivered" });
  });
});

describe("réponses du serveur sur la file locale", () => {
  it("conserve les remises sans réponse et expose le motif reçu pour une remise refusée", async () => {
    const queue = opQueue<SyncOp>(memoryStore(), "catering");
    const failed = delivery("refused", "meal-a");
    const accepted = delivery("accepted", "meal-b");
    const pending = delivery("pending", "meal-c");
    for (const op of [failed, accepted, pending]) await queue.push(op);
    const result = await settleFieldSync(queue, [failed, accepted], [
      { id: "refused", status: "rejected", reason: "Élément annulé ou libéré" },
      { id: "accepted", status: "applied" },
      { id: "pending", status: "applied" },
    ], "catering");
    expect(await queue.pending()).toEqual([pending]);
    expect(result).toEqual({
      pending: 1,
      rejection: "Élément annulé ou libéré",
      deliveries: {
        "meal-a": { status: "rejected", reason: "Élément annulé ou libéré" },
        "meal-b": { status: "delivered" },
      },
    });
  });

  it("affiche un refus compréhensible même si le serveur ne donne pas de motif", async () => {
    const queue = opQueue<SyncOp>(memoryStore(), "catering");
    const op = delivery("refused", "meal-a");
    await queue.push(op);

    await expect(settleFieldSync(queue, [op], [{ id: op.id, status: "rejected" }], "catering"))
      .resolves.toEqual({
        pending: 0,
        deliveries: { "meal-a": { status: "rejected", reason: "Remise refusée" } },
        rejection: "Opération refusée",
      });
  });

  it("ne signale aucun refus quand une vente et une remise sont confirmées", async () => {
    const queue = opQueue<SyncOp>(memoryStore(), "catering");
    const meal = delivery("meal", "meal-a");
    const sale: SyncOp = {
      type: "onsiteSale", id: "sale", optionId: "option", variantId: null,
      quantity: 1, method: "CASH", scannedAt: new Date(),
    };
    await queue.push(meal);
    await queue.push(sale);

    await expect(settleFieldSync(queue, [meal, sale], [
      { id: meal.id, status: "duplicate" },
      { id: sale.id, status: "applied" },
    ], "catering")).resolves.toEqual({
      pending: 0,
      deliveries: { "meal-a": { status: "delivered" } },
      rejection: null,
    });
  });

  it("laisse le traitement de l’accueil indépendant du suivi restauration", async () => {
    const queue = opQueue<SyncOp>(memoryStore(), "reception");
    const op: SyncOp = { type: "manual", id: "entry", direction: "IN", reason: "Sans billet", scannedAt: new Date() };
    await queue.push(op);
    expect(await settleFieldSync(queue, [op], [{ id: op.id, status: "duplicate" }], "reception"))
      .toEqual({ pending: 0, deliveries: {}, rejection: null });
    expect(await queue.pending()).toEqual([]);
  });
});
