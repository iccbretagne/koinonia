import { describe, expect, it } from "vitest";
import type { SyncOp } from "@/modules/ticketing/schemas";
import { deliveryFeedback } from "./sync-feedback";

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
