import type { SyncOp } from "@/modules/ticketing/schemas";

export type SyncResult = { id: string; status: "applied" | "duplicate" | "rejected"; reason?: string };
export type DeliveryFeedback = Record<string, { status: "pending" | "delivered" | "rejected"; reason?: string }>;

export function deliveryFeedback(previous: DeliveryFeedback, ops: SyncOp[], results: SyncResult[] = []) {
  const byId = new Map(results.map((result) => [result.id, result]));
  const next = { ...previous };
  for (const op of ops) {
    if (op.type !== "delivery") continue;
    const result = byId.get(op.id);
    next[op.itemId] = !result ? { status: "pending" } : result.status === "rejected"
      ? { status: "rejected", reason: result.reason ?? "Remise refusée" }
      : { status: "delivered" };
  }
  return next;
}
