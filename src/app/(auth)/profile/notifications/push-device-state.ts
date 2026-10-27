/**
 * État des notifications natives sur l'appareil courant (spec 068). Fonction pure : les
 * capacités du navigateur sont lues par l'appelant, ce qui la rend testable sans navigateur.
 */
export type PushDeviceState =
  | "unavailable-instance"
  | "unavailable-ios-install"
  | "unavailable-browser"
  | "blocked"
  | "enabled"
  | "disabled";

export interface PushDeviceEnvironment {
  /** L'instance a ses clés VAPID. */
  configured: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  /** iPhone ou iPad (iPadOS se présente comme un Mac tactile). */
  isIos: boolean;
  /** Koinonia ouverte depuis l'écran d'accueil (application installée). */
  isStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  /** L'appareil a un abonnement actif. */
  subscribed: boolean;
}

export function pushDeviceState(env: PushDeviceEnvironment): PushDeviceState {
  if (!env.configured) return "unavailable-instance";
  // Sur iPhone/iPad, le push n'existe que dans l'application installée (iOS 16.4+).
  if (env.isIos && !env.isStandalone) return "unavailable-ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || env.permission === "unsupported") return "unavailable-browser";
  if (env.permission === "denied") return "blocked";
  return env.subscribed && env.permission === "granted" ? "enabled" : "disabled";
}

/** iPhone ou iPad : règle partagée avec l'aide à l'installation (spec 070). */
export { detectIos } from "@/lib/install/detect";

/** Clé publique VAPID (base64url) → tableau d'octets attendu par `pushManager.subscribe`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.codePointAt(i) ?? 0;
  return bytes;
}
