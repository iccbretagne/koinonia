/**
 * Tests — site d'événement par l'assistant IA (spec 084, lot 4) : rôle Communication autorisé sur le
 * site et refusé sur le domaine, observateur et compte sans rôle refusés, contraste et lien interdit
 * refusés dès l'aperçu, changement concurrent refusé, Markdown converti en arbre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { viewerFor } from "../../assistant/__tests__/viewers";

let stored: Record<string, unknown> = {};
let lastToken = "";
const mcp = {
  createConfirmation: vi.fn(async (_g: string, _a: string, payload: unknown) => {
    lastToken = `kmx_tok_${Object.keys(stored).length + 1}`;
    stored[lastToken] = payload;
    return { token: lastToken, expiresAt: new Date("2099-01-01T00:05:00Z") };
  }),
  consumeConfirmation: vi.fn(async (_g: string, _a: string, token: string) => stored[token] ?? null),
  publicOrigin: () => "https://koinonia.test",
};
vi.mock("@/modules/mcp", () => mcp);
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const { EVENT_ACTIONS } = await import("@/modules/ticketing/auth");
const MATRIX = EVENT_ACTIONS as unknown as Record<string, string[]>;
const { defaultSiteDocument } = await import("@/modules/ticketing/schemas");

let roles = new Set<string>(["COMMUNICATION"]);
let updatedAt = "2099-01-01T00:00:00.000Z";
let published = false;
let draft = defaultSiteDocument("Nuit de la traversée");
let domain: { id: string; host: string; status: string; records: unknown[] } | null = null;
const siteView = () => ({ id: "s1", slug: "nuit", draft, published, publishedAt: null, afterCloseDays: 30, issues: [], updatedAt });

const svc = {
  isTicketingManager: vi.fn(async () => false),
  listEvents: vi.fn(async () => [{ id: "tk-1", title: "Nuit de la traversée", startsAt: new Date("2099-12-31T19:00:00Z"), status: "OPEN" }]),
  getEventAccess: vi.fn(async (_s: unknown, id: string) => ({ eventId: id, churchId: "c1", status: "OPEN", manager: false, roles })),
  canDo: (access: { roles: Set<string> }, action: string) => MATRIX[action].some((r) => access.roles.has(r)),
  getSite: vi.fn(async () => siteView()),
  saveDraft: vi.fn(async (_e: string, _u: string, doc: typeof draft) => {
    draft = doc;
    return siteView();
  }),
  publishSite: vi.fn(async () => siteView()),
  unpublishSite: vi.fn(async () => siteView()),
  getDomain: vi.fn(async () => domain),
  requestDomain: vi.fn(async (_e: string, _u: string, host: string) => ({ id: "d1", host, status: "PENDING", records: [{ type: "TXT", name: `_koinonia.${host}`, value: "tok" }] })),
  verifyDomain: vi.fn(async () => ({ host: "fete.exemple.org", status: "VERIFIED", lastError: null })),
  removeDomain: vi.fn(async () => undefined),
};
vi.mock("@/modules/ticketing", () => svc);
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), withAuditContext: async (_e: unknown, fn: () => Promise<unknown>) => fn() }));

const s = await import("../_actions/site");
const A = (name: string) => s.SITE_ACTIONS.find((a) => a.name === name)!;
const ctx = { session: { user: { id: "user-1" } } as never, churchId: "c1", viewer: viewerFor("STAR", { predicates: ["ticketing"] }), grantId: "g1" };
const preview = (action: string, input: unknown) => A(`${action}_preview`).run(input as never, ctx);
const confirm = (action: string, token = lastToken) => A(`${action}_confirm`).run({ confirmation: token } as never, ctx);

beforeEach(() => {
  vi.clearAllMocks();
  roles = new Set(["COMMUNICATION"]);
  updatedAt = "2099-01-01T00:00:00.000Z";
  published = false;
  draft = defaultSiteDocument("Nuit de la traversée");
  domain = null;
  stored = {};
  lastToken = "";
});

describe("droits", () => {
  it("Communication : lit et modifie le site, publie ; refusée sur le domaine", async () => {
    expect((await A("ticketing_site").run({ event: "tk-1" } as never, ctx)).structured.id).toBe("tk-1");
    expect((await preview("edit_ticketing_site_theme", { event: "tk-1", theme: { colors: { accent: "#8b0000" } } })).structured.confirmation).toMatch(/^kmx_tok/);
    expect((await preview("publish_ticketing_site", { event: "tk-1", op: "publish" })).structured.confirmation).toMatch(/^kmx_tok/);
    expect((await preview("request_ticketing_site_domain", { event: "tk-1", op: "request", host: "fete.exemple.org" })).text).toBe("Vous n'avez pas ce rôle sur cet événement dans Koinonia.");
    expect(svc.requestDomain).not.toHaveBeenCalled();
  });

  it("Communication ne voit pas le domaine dans la lecture ; l'organisateur oui", async () => {
    domain = { id: "d1", host: "fete.exemple.org", status: "APPROVED", records: [] };
    expect((await A("ticketing_site").run({ event: "tk-1" } as never, ctx)).structured.domain).toBeNull();
    roles = new Set(["ORGANIZER"]);
    expect((await A("ticketing_site").run({ event: "tk-1" } as never, ctx)).structured.domain).toMatchObject({ host: "fete.exemple.org" });
  });

  it("organisateur : demande un domaine", async () => {
    roles = new Set(["ORGANIZER"]);
    expect((await preview("request_ticketing_site_domain", { event: "tk-1", op: "request", host: "fete.exemple.org" })).structured.confirmation).toMatch(/^kmx_tok/);
    const done = await confirm("request_ticketing_site_domain");
    expect(done.text).toContain("TXT _koinonia.fete.exemple.org");
    expect(svc.requestDomain).toHaveBeenCalledWith("tk-1", "user-1", "fete.exemple.org");
  });

  it("observateur et compte sans rôle : refusés partout", async () => {
    for (const r of [new Set(["OBSERVER"]), new Set<string>()]) {
      roles = r;
      for (const a of ["ticketing_site"]) expect((await A(a).run({ event: "tk-1" } as never, ctx)).structured.done).toBe(false);
      expect((await preview("edit_ticketing_site_page", { event: "tk-1", op: "delete", slug: "billetterie" })).structured.done).toBe(false);
      expect((await preview("publish_ticketing_site", { event: "tk-1", op: "publish" })).structured.done).toBe(false);
    }
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("jamais proposées à un compte sans le prédicat billetterie", () => {
    expect(A("edit_ticketing_site_block_preview").available(viewerFor("STAR"))).toBe(false);
    expect(A("edit_ticketing_site_block_preview").available(ctx.viewer)).toBe(true);
  });
});

describe("validation dès l'aperçu", () => {
  it("contraste insuffisant refusé, rien n'est stocké", async () => {
    const out = await preview("edit_ticketing_site_theme", { event: "tk-1", theme: { colors: { text: "#fafafa" } } });
    expect(out.text).toContain("peu lisible");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("lien interdit refusé (javascript:, http:, page inconnue)", async () => {
    for (const href of ["javascript:alert(1)", "http://exemple.org"]) {
      const out = await preview("edit_ticketing_site_block", { event: "tk-1", op: "create", target: "block", page: "accueil", band: 0, markdown: `[x](${href})` });
      expect(out.structured.done, href).toBe(false);
    }
    const unknown = await preview("edit_ticketing_site_block", { event: "tk-1", op: "create", target: "block", page: "accueil", band: 0, markdown: "[x](page:inconnue)" });
    expect(unknown.text).toContain("page qui n'existe pas");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("bloc invalide, page ou rang introuvables : refus lisibles", async () => {
    expect((await preview("edit_ticketing_site_block", { event: "tk-1", op: "create", target: "block", page: "accueil", band: 0, blockData: { kind: "palette", swatches: [{ label: "x", color: "rouge" }] } })).structured.done).toBe(false);
    expect((await preview("edit_ticketing_site_block", { event: "tk-1", op: "delete", target: "block", page: "nope", band: 0, block: 0 })).text).toContain("introuvable");
    expect((await preview("edit_ticketing_site_block", { event: "tk-1", op: "delete", target: "block", page: "accueil", band: 7, block: 0 })).text).toContain("Bande 7 introuvable");
    expect((await preview("edit_ticketing_site_block", { event: "tk-1", op: "create", target: "block", page: "billetterie", band: 0, markdown: "x" })).text).toContain("automatique");
  });

  it("un site garde au moins une page ; 8 pages au plus", async () => {
    draft = siteDocument1();
    expect((await preview("edit_ticketing_site_page", { event: "tk-1", op: "delete", slug: "accueil" })).text).toContain("au moins une page");
    draft = defaultSiteDocument("N");
    for (let i = 0; i < 6; i++) draft.pages.push({ title: `P${i}`, slug: `p-${i}`, inMenu: true, kind: "content", sections: [] });
    expect((await preview("edit_ticketing_site_page", { event: "tk-1", op: "create", page: { title: "De trop", slug: "de-trop" } })).structured.done).toBe(false);
  });
});

function siteDocument1() {
  const d = defaultSiteDocument("N");
  d.pages = [d.pages[0]];
  return d;
}

const heroTitle = () => (draft.pages[0].sections[0].blocks[0] as { title: string }).title;
const op = {
  hero: (title: string) => ({ type: "block", op: "update", target: "block", page: "accueil", band: 0, block: 0, blockData: { kind: "hero", title } }),
  band: (textColor: string) => ({ type: "block", op: "update", target: "band", page: "accueil", band: 0, bandFields: { textColor } }),
  page: (slug: string) => ({ type: "page", op: "create", page: { title: slug, slug } }),
};

describe("jetons indépendants", () => {
  it("deux aperçus sur des endroits différents, confirmés l'un après l'autre : tous deux appliqués", async () => {
    await preview("edit_ticketing_site_theme", { event: "tk-1", theme: { colors: { accent: "#8b0000" } } });
    const t1 = lastToken;
    await preview("edit_ticketing_site_page", { event: "tk-1", op: "create", page: { title: "Infos", slug: "infos" } });
    const t2 = lastToken;
    await preview("edit_ticketing_site_block", { event: "tk-1", op: "update", target: "block", page: "accueil", band: 0, block: 0, blockData: { kind: "hero", title: "Nouveau" } });
    const t3 = lastToken;
    expect((await confirm("edit_ticketing_site_theme", t1)).structured.done).toBe(true);
    expect((await confirm("edit_ticketing_site_page", t2)).structured.done).toBe(true);
    expect((await confirm("edit_ticketing_site_block", t3)).structured.done).toBe(true);
    expect(draft.theme.colors.accent).toBe("#8b0000");
    expect(draft.pages.map((p) => p.slug)).toContain("infos");
    expect(heroTitle()).toBe("Nouveau");
  });

  it("deux aperçus sur la même bande : le second est refusé", async () => {
    await preview("edit_ticketing_site_block", { event: "tk-1", op: "update", target: "block", page: "accueil", band: 0, block: 0, blockData: { kind: "hero", title: "A" } });
    const t1 = lastToken;
    await preview("edit_ticketing_site_block", { event: "tk-1", op: "update", target: "block", page: "accueil", band: 0, block: 0, blockData: { kind: "hero", title: "B" } });
    const t2 = lastToken;
    expect((await confirm("edit_ticketing_site_block", t1)).structured.done).toBe(true);
    expect((await confirm("edit_ticketing_site_block", t2)).text).toContain("ont changé");
    expect(heroTitle()).toBe("A");
  });

  it("confirmation devenue illisible sur le brouillon courant : refus explicite, rien d'enregistré", async () => {
    await preview("edit_ticketing_site_block", { event: "tk-1", op: "update", target: "band", page: "accueil", band: 0, bandFields: { textColor: "secondary" } });
    const t1 = lastToken;
    // Changement hors de la portion touchée (thème) qui rend le texte illisible.
    draft.theme.colors.secondary = "#fafafa";
    const out = await confirm("edit_ticketing_site_block", t1);
    expect(out.structured.done).toBe(false);
    expect(out.text).toContain("Rien n'est fait");
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });
});

describe("lot", () => {
  it("opérations appliquées dans l'ordre, un seul jeton, un seul enregistrement", async () => {
    const p = await preview("edit_ticketing_site_batch", { event: "tk-1", operations: [op.page("infos"), op.hero("Premier"), op.hero("Second")] });
    expect(p.text).toContain("1. Page : create");
    expect(p.text).toContain("3. Bloc");
    expect((await confirm("edit_ticketing_site_batch")).structured.done).toBe(true);
    expect(svc.saveDraft).toHaveBeenCalledTimes(1);
    expect(heroTitle()).toBe("Second");
    expect(draft.pages.map((p) => p.slug)).toContain("infos");
  });

  it("atomique : une opération invalide ⇒ aucun jeton, rien d'enregistré", async () => {
    const out = await preview("edit_ticketing_site_batch", { event: "tk-1", operations: [op.hero("Ok"), { type: "block", op: "delete", target: "block", page: "nope", band: 0, block: 0 }] });
    expect(out.text).toContain("Opération 2");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it("un lot qui rend le site illisible est refusé dès l'aperçu", async () => {
    const out = await preview("edit_ticketing_site_batch", { event: "tk-1", operations: [op.hero("Ok"), { type: "theme", theme: { colors: { text: "#fafafa" } } }] });
    expect(out.text).toContain("peu lisible");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("l'ordre compte : un lot qui crée puis remplit une page passe, l'inverse est refusé", async () => {
    const fill = { type: "block", op: "create", target: "band", page: "infos" };
    expect((await preview("edit_ticketing_site_batch", { event: "tk-1", operations: [op.page("infos"), fill] })).structured.confirmation).toMatch(/^kmx_tok/);
    expect((await preview("edit_ticketing_site_batch", { event: "tk-1", operations: [fill, op.page("infos")] })).text).toContain("Opération 1");
  });

  it("51 opérations ou lot vide : refusés par le schéma", () => {
    expect(A("edit_ticketing_site_batch_preview").input.safeParse({ event: "x", operations: [] }).success).toBe(false);
    expect(A("edit_ticketing_site_batch_preview").input.safeParse({ event: "x", operations: Array(51).fill(op.hero("x")) }).success).toBe(false);
  });
});

describe("confirmation", () => {
  it("Markdown converti en arbre, enregistré en brouillon", async () => {
    await preview("edit_ticketing_site_block", { event: "tk-1", op: "create", target: "block", page: "accueil", band: 0, markdown: "## Dress code\n\nSoyez **élégants**.\n\n- Robe longue\n- Costume" });
    const out = await confirm("edit_ticketing_site_block");
    expect(out.structured.done).toBe(true);
    const saved = (svc.saveDraft.mock.calls[0] as unknown as [string, string, { pages: { sections: { blocks: { kind: string; content?: unknown[] }[] }[] }[] }])[2];
    const block = saved.pages[0].sections[0].blocks.at(-1)!;
    expect(block.kind).toBe("richText");
    expect(block.content).toEqual([
      { type: "h2", children: [{ text: "Dress code" }] },
      { type: "p", children: [{ text: "Soyez " }, { text: "élégants", bold: true }, { text: "." }] },
      { type: "ul", items: [[{ text: "Robe longue" }], [{ text: "Costume" }]] },
    ]);
  });

  it("brouillon modifié depuis l'aperçu ⇒ refus CHANGED, rien d'enregistré", async () => {
    await preview("edit_ticketing_site_theme", { event: "tk-1", theme: { colors: { accent: "#8b0000" } } });
    draft.theme.colors.accent = "#006400";
    const out = await confirm("edit_ticketing_site_theme");
    expect(out.text).toContain("ont changé");
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });

  it("publication puis dépublication ; dépublier un site non publié est refusé", async () => {
    await preview("publish_ticketing_site", { event: "tk-1", op: "publish" });
    await confirm("publish_ticketing_site");
    expect(svc.publishSite).toHaveBeenCalledWith("tk-1", "user-1");
    expect((await preview("publish_ticketing_site", { event: "tk-1", op: "unpublish" })).text).toBe("Le site n'est pas publié.");
    published = true;
    await preview("publish_ticketing_site", { event: "tk-1", op: "unpublish" });
    await confirm("publish_ticketing_site");
    expect(svc.unpublishSite).toHaveBeenCalled();
  });
});
