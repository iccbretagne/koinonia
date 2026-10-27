/** Contenu d'une notification native (spec 068) : jamais plus que ce que montre la cloche. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const TITLE_MAX = 120;
const BODY_MAX = 240;
const FALLBACK_URL = "/accueil";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Lien relatif à Koinonia uniquement : un lien absolu ou externe ramène à l'accueil. */
function safeUrl(link: string | null | undefined): string {
  if (!link?.startsWith("/") || link.startsWith("//")) return FALLBACK_URL;
  return link;
}

export function buildPushPayload(notification: {
  id: string;
  title: string;
  message: string;
  link?: string | null;
}): PushPayload {
  return {
    title: truncate(notification.title, TITLE_MAX),
    body: truncate(notification.message, BODY_MAX),
    url: safeUrl(notification.link),
    tag: notification.id,
  };
}
