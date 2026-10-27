import webpush from "web-push";

/**
 * Configuration Web Push (spec 068, ADR-0024) : une paire de clés VAPID par environnement, lue
 * à l'exécution (jamais figée au build). Sans clés, les notifications natives sont simplement
 * indisponibles.
 */
export function getVapidConfig(env: NodeJS.ProcessEnv = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

let configured = false;

/** Client `web-push` configuré, ou `null` sans clés. */
export function getWebPush(): typeof webpush | null {
  const config = getVapidConfig();
  if (!config) return null;
  if (!configured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configured = true;
  }
  return webpush;
}
