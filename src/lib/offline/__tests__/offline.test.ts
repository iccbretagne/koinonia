import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "../hash";
import { deviceId, memoryStore, opQueue } from "../store";

describe("client hors ligne (spec 074, ADR-0026)", () => {
  it("l'empreinte calculée sur l'appareil est celle du serveur", async () => {
    const token = "ab".repeat(32);
    expect(await sha256Hex(token)).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("file d'opérations : ordre d'ajout, retrait par identifiant, cloisonnée par écran", async () => {
    const store = memoryStore();
    const q = opQueue<{ id: string; n: number }>(store, "ev-1:reception");
    const other = opQueue<{ id: string; n: number }>(store, "ev-1:catering");
    await q.push({ id: "a", n: 1 });
    await q.push({ id: "b", n: 2 });
    await q.push({ id: "c", n: 3 });
    await other.push({ id: "z", n: 9 });
    expect((await q.pending()).map((o) => o.id)).toEqual(["a", "b", "c"]);
    await q.remove(["a", "c"]);
    expect((await q.pending()).map((o) => o.id)).toEqual(["b"]);
    expect(await other.count()).toBe(1);
  });

  it("identifiant d'appareil stable", async () => {
    const store = memoryStore();
    const first = await deviceId(store);
    expect(await deviceId(store)).toBe(first);
  });
});
