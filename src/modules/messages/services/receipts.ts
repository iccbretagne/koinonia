import { ApiError } from "@/lib/api-utils";
import { viewerInAudience, type MessageViewer } from "./messages";

/**
 * « Vu » et « fermé » (spec 071) : une ligne par personne et par message, qui masque le bandeau
 * sur tous ses appareils et alimente les statistiques. Réservé au public du message ; un message
 * urgent ne se ferme pas.
 */
export async function recordReceipt(
  messageId: string,
  viewer: MessageViewer,
  action: "seen" | "dismiss"
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const message = await prisma.systemMessage.findUnique({
    where: { id: messageId },
    select: { churchId: true, audience: true, severity: true },
  });
  if (!message || !(await viewerInAudience(message, viewer))) throw new ApiError(404, "Message introuvable");
  if (action === "dismiss" && message.severity === "URGENT") {
    throw new ApiError(400, "Un message urgent ne se ferme pas.");
  }
  const dismissedAt = action === "dismiss" ? new Date() : undefined;
  await prisma.systemMessageReceipt.upsert({
    where: { messageId_userId: { messageId, userId: viewer.userId } },
    create: { messageId, userId: viewer.userId, dismissedAt: dismissedAt ?? null },
    update: dismissedAt ? { dismissedAt } : {},
  });
}
