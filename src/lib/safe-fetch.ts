import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { ApiError } from "@/lib/errors";

/**
 * Téléchargement d'une image par URL, protégé contre le SSRF : https seulement (port 443), nom résolu
 * puis **toute** adresse privée, locale, de liaison, multicast ou réservée refusée (IPv4 et IPv6,
 * `::ffff:` compris), connexion **épinglée sur l'adresse vérifiée** (une seule résolution : pas de
 * DNS rebinding), aucune redirection suivie, délai total et poids bornés. Le type annoncé n'est
 * qu'un filtre : l'appelant revérifie le contenu.
 */

export const FETCH_LIMITS = { maxBytes: 8 * 1024 * 1024, timeoutMs: 10_000 } as const;

const fail = (message: string): never => {
  throw new ApiError(400, message);
};

// ─── Adresses ────────────────────────────────────────────────────────────────

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

function publicV4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a >= 224) return false; // multicast et réservé (240/4, 255.255.255.255)
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64/10
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // 192.0.0/24, 192.0.2/24
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** 8 groupes de 16 bits d'une adresse IPv6 (forme `::` et IPv4 finale développées). */
function v6Groups(ip: string): number[] | null {
  let text = ip.split("%")[0].toLowerCase();
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const b = v4Bytes(tail[1]);
    if (!b) return null;
    text = text.slice(0, -tail[1].length) + ((b[0] << 8) | b[1]).toString(16) + ":" + ((b[2] << 8) | b[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

/** Adresse routable publiquement ? Tout ce qui est douteux ou illisible est refusé. */
export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const b = v4Bytes(ip);
    return !!b && publicV4(b);
  }
  if (version !== 6) return false;
  const g = v6Groups(ip);
  if (!g) return false;
  // IPv4 encapsulée : ::ffff:a.b.c.d (mappée) — on juge l'IPv4 contenue.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  // Liste blanche : unicast global 2000::/3, hors documentation, Teredo et 6to4.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false;
  if (g[0] === 0x2002) return false;
  return true;
}

// ─── Téléchargement ──────────────────────────────────────────────────────────

export interface FetchDeps {
  resolve: (host: string) => Promise<{ address: string; family: number }[]>;
  request: typeof https.request;
}

const realDeps: FetchDeps = { resolve: (host) => dnsLookup(host, { all: true, verbatim: true }), request: https.request };
const IMAGE_TYPES = /^image\/(jpeg|png|webp|svg\+xml)(;|$)/i;

export async function safeFetchImage(rawUrl: string, deps: Partial<FetchDeps> = {}, limits: { maxBytes: number; timeoutMs: number } = FETCH_LIMITS): Promise<Buffer> {
  const { resolve, request } = { ...realDeps, ...deps };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail("Adresse d'image invalide");
  }
  if (url.protocol !== "https:") fail("Adresse refusée : https uniquement");
  if (url.username || url.password) fail("Adresse refusée : pas d'identifiants dans l'adresse");
  if (url.port && url.port !== "443") fail("Adresse refusée : port 443 uniquement");
  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: { address: string; family: number }[];
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      return fail("Adresse d'image introuvable (nom inconnu)");
    }
  }
  if (!addresses.length) fail("Adresse d'image introuvable (nom inconnu)");
  if (addresses.some((a) => !isPublicIp(a.address))) fail("Adresse refusée : elle pointe vers un réseau privé ou réservé");
  const target = addresses[0];

  return new Promise<Buffer>((resolveBody, reject) => {
    let settled = false;
    const done = (error: Error | null, body?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        req.destroy();
        reject(error);
      } else resolveBody(body!);
    };
    const req = request(
      {
        host,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isIP(host) ? undefined : host,
        headers: { Host: url.host, Accept: "image/jpeg,image/png,image/webp,image/svg+xml", "User-Agent": "Koinonia-site-image/1.0" },
        // Épinglage : la connexion part vers l'adresse vérifiée, jamais vers une seconde résolution.
        lookup: ((_h: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => {
          if (options?.all) cb(null, [{ address: target.address, family: target.family }]);
          else cb(null, target.address, target.family);
        }) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) return done(new ApiError(400, "Adresse refusée : les redirections ne sont pas suivies"));
        if (status !== 200) return done(new ApiError(400, `Téléchargement impossible (réponse ${status})`));
        if (!IMAGE_TYPES.test(String(res.headers["content-type"] ?? ""))) return done(new ApiError(400, "L'adresse ne renvoie pas une image (JPEG, PNG, WebP ou SVG)"));
        if (Number(res.headers["content-length"] ?? 0) > limits.maxBytes) return done(new ApiError(400, "Image trop lourde (8 Mo au plus)"));
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > limits.maxBytes) return done(new ApiError(400, "Image trop lourde (8 Mo au plus)"));
          chunks.push(chunk);
        });
        res.on("end", () => done(null, Buffer.concat(chunks)));
        res.on("error", () => done(new ApiError(400, "Téléchargement interrompu")));
      }
    );
    const timer = setTimeout(() => done(new ApiError(400, "Téléchargement trop long (10 s au plus)")), limits.timeoutMs);
    req.on("error", () => done(new ApiError(400, "Téléchargement impossible")));
    req.end();
  });
}
