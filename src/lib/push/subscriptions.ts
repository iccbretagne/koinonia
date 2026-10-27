import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Cookie `httpOnly` désignant l'abonnement de l'appareil courant (nettoyé à la déconnexion). */
export const PUSH_DEVICE_COOKIE = "koinonia-push-device";

export interface DeviceSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

/** Libellé lisible d'un appareil (« iPhone · Safari »), dérivé de l'User-Agent. Fonction pure. */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  let device: string | null = null;
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) device = "Mac";
  else if (/Linux/.test(ua)) device = "Linux";

  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  const parts = [device, browser].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Enregistre l'abonnement d'un appareil pour l'utilisateur (spec 068). Un appareil n'appartient
 * qu'à un compte : l'endpoint d'un autre compte lui est réattribué, ce qui coupe les
 * notifications de l'ancien compte sur cet appareil.
 */
export async function subscribeDevice(
  userId: string,
  input: DeviceSubscriptionInput,
  userAgent: string | null
): Promise<{ id: string }> {
  const hash = endpointHash(input.endpoint);
  const existing = await prisma.pushSubscription.findUnique({ where: { endpointHash: hash }, select: { id: true, userId: true } });
  if (existing && existing.userId !== userId) {
    logger.info({ subscriptionId: existing.id, fromUserId: existing.userId, toUserId: userId }, "Appareil push réattribué à un autre compte");
  }
  const data = {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    label: deviceLabel(userAgent),
  };
  const saved = await prisma.pushSubscription.upsert({
    where: { endpointHash: hash },
    create: { ...data, endpointHash: hash },
    update: data,
    select: { id: true },
  });
  return saved;
}

/** Supprime l'abonnement désigné, **seulement** s'il appartient à l'utilisateur. */
export async function unsubscribeDevice(userId: string, target: { endpoint: string } | { id: string }): Promise<void> {
  const where = "id" in target ? { id: target.id, userId } : { endpointHash: endpointHash(target.endpoint), userId };
  await prisma.pushSubscription.deleteMany({ where });
}

export async function countDevices(userId: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { userId } });
}
