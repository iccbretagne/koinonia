/** Tests — garde SSRF du téléchargement d'images : adresses, schéma, redirections, taille, épinglage. Aucun réseau réel. */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { isPublicIp, safeFetchImage, type FetchDeps } from "../safe-fetch";

describe("isPublicIp", () => {
  it.each([
    "0.0.0.0", "127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.255",
    "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::", "::127.0.0.1", "pas une ip", "999.1.1.1",
  ])("refuse %s", (ip) => expect(isPublicIp(ip)).toBe(false));

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4007:80f::200e", "::ffff:8.8.8.8"])("accepte %s", (ip) => expect(isPublicIp(ip)).toBe(true));
});

type Reply = { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; hang?: boolean };

function deps(addresses: { address: string; family: number }[], reply: Reply = {}) {
  const calls: { options: Record<string, unknown> }[] = [];
  const resolve = vi.fn(async () => addresses);
  const request = ((options: Record<string, unknown>, cb: (res: unknown) => void) => {
    calls.push({ options });
    const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: () => undefined });
    req.end = () => {
      if (reply.hang) return;
      const res = Object.assign(new EventEmitter(), { statusCode: reply.status ?? 200, headers: { "content-type": "image/png", ...reply.headers } });
      cb(res);
      for (const c of reply.chunks ?? [Buffer.from("png")]) res.emit("data", c);
      res.emit("end");
    };
    return req;
  }) as unknown as FetchDeps["request"];
  return { resolve, request, calls };
}
const PUBLIC = [{ address: "93.184.216.34", family: 4 }];
const limits = { maxBytes: 1024, timeoutMs: 50 };

describe("safeFetchImage", () => {
  it("refuse http, javascript, identifiants et ports autres que 443, sans résoudre", async () => {
    const d = deps(PUBLIC);
    for (const url of ["http://exemple.org/a.png", "ftp://exemple.org/a.png", "https://u:p@exemple.org/a.png", "https://exemple.org:8443/a.png", "n'importe quoi"]) {
      await expect(safeFetchImage(url, d, limits), url).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(d.resolve).not.toHaveBeenCalled();
    expect(d.calls).toHaveLength(0);
  });

  it("refuse dès qu'une adresse résolue est privée (même mêlée à des publiques)", async () => {
    for (const address of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1", "::ffff:192.168.0.1"]) {
      const d = deps([...PUBLIC, { address, family: address.includes(":") ? 6 : 4 }]);
      await expect(safeFetchImage("https://exemple.org/a.png", d, limits), address).rejects.toThrow(/réseau privé/);
      expect(d.calls).toHaveLength(0);
    }
  });

  it("refuse une adresse IP littérale privée, sans résolution", async () => {
    const d = deps(PUBLIC);
    await expect(safeFetchImage("https://127.0.0.1/a.png", d, limits)).rejects.toThrow(/réseau privé/);
    await expect(safeFetchImage("https://[::1]/a.png", d, limits)).rejects.toThrow(/réseau privé/);
    await expect(safeFetchImage("https://[::ffff:7f00:1]/a.png", d, limits)).rejects.toThrow(/réseau privé/);
    expect(d.resolve).not.toHaveBeenCalled();
  });

  it("nom introuvable : refus", async () => {
    const d = { ...deps(PUBLIC), resolve: vi.fn(async () => Promise.reject(new Error("ENOTFOUND"))) };
    await expect(safeFetchImage("https://inconnu.exemple/a.png", d, limits)).rejects.toThrow(/introuvable/);
  });

  it("connexion épinglée sur l'adresse vérifiée (lookup figé, SNI, en-tête Host), une seule résolution", async () => {
    const d = deps(PUBLIC);
    const body = await safeFetchImage("https://exemple.org/img/a.png?x=1", d, limits);
    expect(body.toString()).toBe("png");
    expect(d.resolve).toHaveBeenCalledTimes(1);
    const o = d.calls[0].options as { host: string; servername: string; path: string; headers: Record<string, string>; lookup: (...a: unknown[]) => void };
    expect(o).toMatchObject({ host: "exemple.org", servername: "exemple.org", path: "/img/a.png?x=1" });
    const single = vi.fn();
    o.lookup("exemple.org", {}, single);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const all = vi.fn();
    o.lookup("autre.example", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("ne suit aucune redirection", async () => {
    for (const status of [301, 302, 307, 308]) {
      await expect(safeFetchImage("https://exemple.org/a.png", deps(PUBLIC, { status, headers: { location: "https://127.0.0.1/" } }), limits)).rejects.toThrow(/redirections/);
    }
  });

  it("refuse une réponse non 200 ou qui n'est pas une image", async () => {
    await expect(safeFetchImage("https://exemple.org/a.png", deps(PUBLIC, { status: 404 }), limits)).rejects.toThrow(/404/);
    await expect(safeFetchImage("https://exemple.org/a", deps(PUBLIC, { headers: { "content-type": "text/html" } }), limits)).rejects.toThrow(/pas une image/);
  });

  it("arrête au-delà de la taille permise (en-tête ou flux)", async () => {
    await expect(safeFetchImage("https://exemple.org/a.png", deps(PUBLIC, { headers: { "content-length": "2048" } }), limits)).rejects.toThrow(/trop lourde/);
    await expect(safeFetchImage("https://exemple.org/a.png", deps(PUBLIC, { chunks: [Buffer.alloc(700), Buffer.alloc(700)] }), limits)).rejects.toThrow(/trop lourde/);
  });

  it("délai total dépassé : abandon", async () => {
    await expect(safeFetchImage("https://exemple.org/a.png", deps(PUBLIC, { hang: true }), limits)).rejects.toThrow(/trop long/);
  });
});
