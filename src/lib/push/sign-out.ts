import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { PUSH_DEVICE_COOKIE, unsubscribeDevice } from "./subscriptions";

/**
 * À appeler dans une server action de déconnexion, avant `signOut` (spec 068) : l'appareil
 * courant cesse de recevoir les notifications du compte. Côté serveur, donc indépendant du
 * JavaScript de la page. Ne fait jamais échouer la déconnexion.
 */
export async function forgetPushDeviceOnSignOut(): Promise<void> {
  try {
    const store = await cookies();
    const id = store.get(PUSH_DEVICE_COOKIE)?.value;
    if (!id) return;
    const session = await auth();
    if (session?.user?.id) await unsubscribeDevice(session.user.id, { id });
    store.delete(PUSH_DEVICE_COOKIE);
  } catch (error) {
    logger.warn({ err: error }, "Appareil push non oublié à la déconnexion");
  }
}
