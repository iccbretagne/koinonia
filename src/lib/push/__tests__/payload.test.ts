import { describe, it, expect } from "vitest";
import { buildPushPayload } from "../payload";

const base = { id: "n-1", title: "Ajouté au service", message: "Dimanche 2 novembre, Son.", link: "/planning" };

describe("buildPushPayload (spec 068)", () => {
  it("reprend exactement le titre, le message et le lien de la cloche", () => {
    expect(buildPushPayload(base)).toEqual({ title: base.title, body: base.message, url: "/planning", tag: "n-1" });
  });

  it("n'ajoute aucun champ", () => {
    expect(Object.keys(buildPushPayload(base)).sort()).toEqual(["body", "tag", "title", "url"]);
  });

  it("tronque titre et message trop longs", () => {
    const payload = buildPushPayload({ ...base, title: "T".repeat(300), message: "M".repeat(500) });
    expect(payload.title).toHaveLength(120);
    expect(payload.title.endsWith("…")).toBe(true);
    expect(payload.body).toHaveLength(240);
  });

  it.each([null, undefined, "", "https://exemple.org/piege", "//exemple.org", "javascript:alert(1)"])(
    "lien %s : ramené à l'accueil",
    (link) => {
      expect(buildPushPayload({ ...base, link }).url).toBe("/accueil");
    }
  );
});
