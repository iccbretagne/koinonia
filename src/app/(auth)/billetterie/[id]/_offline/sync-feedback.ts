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

export async function settleFieldSync(
  queue: { remove(ids: string[]): Promise<void>; count(): Promise<number> },
  sent: SyncOp[],
  results: SyncResult[],
  kind: "reception" | "catering",
) {
  const sentIds = new Set(sent.map((op) => op.id));
  const matched = results.filter((result) => sentIds.has(result.id));
  await queue.remove(matched.map((result) => result.id));
  const pending = await queue.count();
  if (kind === "reception") return { pending, deliveries: {}, rejection: null };

  const matchedIds = new Set(matched.map((result) => result.id));
  const deliveries = deliveryFeedback({}, sent.filter((op) => matchedIds.has(op.id)), matched);
  const rejection = matched.filter((result) => result.status === "rejected")
    .map((result) => result.reason ?? "Opération refusée").join(" · ") || null;
  return { pending, deliveries, rejection };
}
