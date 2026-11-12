/**
 * Tests — serveur MCP (spec 081) : authentification par jeton, débit, méthodes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyAccessToken = vi.fn();
const recordMcpCall = vi.fn();
vi.mock("@/modules/mcp", () => ({
  verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a),
  recordMcpCall: (...a: unknown[]) => recordMcpCall(...a),
  publicOrigin: () => "https://koinonia.test",
  canWrite: (scope: string) => scope.split(" ").includes("write"),
}));
const actionsFor = vi.fn((_viewer: unknown, write: boolean) =>
  write
    ? [
        { name: "planning_candidates", action: "planning_candidates", kind: "read", description: "lecture", input: {}, run: vi.fn() },
        { name: "declare_unavailability_preview", action: "declare_unavailability", kind: "preview", description: "aperçu", input: {}, run: vi.fn() },
        { name: "declare_unavailability_confirm", action: "declare_unavailability", kind: "confirm", description: "confirme", input: {}, run: vi.fn() },
        { name: "fill_planning_confirm", action: "fill_planning", kind: "confirm", description: "confirme", input: {}, run: vi.fn() },
      ]
    : []
);
vi.mock("../_actions", () => ({
  actionsFor: (v: unknown, w: boolean) => actionsFor(v, w),
  canDraftRequest: () => true,
  draftRequest: vi.fn(),
  DRAFT_REQUEST_TOOL: { name: "draft_request", description: "lien", input: {} },
}));
const buildSessionForUser = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/auth", () => ({ buildSessionForUser: () => buildSessionForUser() }));
vi.mock("../../assistant/_viewer", () => ({ buildViewer: vi.fn() }));
vi.mock("../_tools", () => ({
  GUIDE_TOOL: "guide_search",
  NO_DATA: "Aucune donnée",
  guideInput: {},
  toolInput: {},
  renderResult: vi.fn(),
  runTool: vi.fn(),
  searchGuide: vi.fn(),
  toolsFor: vi.fn(() => []),
}));

const route = await import("../server/route");
const post = (auth?: string) =>
  new Request("https://koinonia.test/api/mcp/server", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("serveur MCP", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sans jeton : 401 et WWW-Authenticate vers les métadonnées de la ressource", async () => {
    const res = await route.POST(post());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://koinonia.test/.well-known/oauth-protected-resource/api/mcp/server"'
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("jeton refusé (révoqué, expiré, fonction coupée…) : 401 sans détail", async () => {
    verifyAccessToken.mockResolvedValue(null);
    const res = await route.POST(post("Bearer kma_x"));
    expect(res.status).toBe(401);
    expect(verifyAccessToken).toHaveBeenCalledWith("kma_x");
  });

  it("compte disparu entre-temps : 401", async () => {
    verifyAccessToken.mockResolvedValue({ grantId: "g", userId: "u-gone", churchId: "c", scope: "read" });
    expect((await route.POST(post("Bearer kma_y"))).status).toBe(401);
  });

  it("au-delà de 60 appels par minute : 429 journalisé", async () => {
    verifyAccessToken.mockResolvedValue({ grantId: "g", userId: "u-rate", churchId: "c", scope: "read" });
    let last: Response | null = null;
    for (let i = 0; i < 61; i++) last = await route.POST(post("Bearer kma_z"));
    expect(last!.status).toBe(429);
    expect(recordMcpCall).toHaveBeenCalledWith(expect.objectContaining({ outcome: "limited", userId: "u-rate" }));
  });

  it("GET et DELETE : 405 (serveur sans état)", async () => {
    expect(route.GET().status).toBe(405);
    expect(route.DELETE().status).toBe(405);
  });

  const rpcAs = (scope: string) => {
    verifyAccessToken.mockResolvedValue({ grantId: "g1", userId: `u-${scope}`, churchId: "c1", scope });
    buildSessionForUser.mockResolvedValue({ user: { id: `u-${scope}` } });
    return (id: number, method: string, params: Record<string, unknown> = {}) =>
      route.POST(
        new Request("https://koinonia.test/api/mcp/server", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer t" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        })
      );
  };
  const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } };

  it("connexion en lecture : instructions « lecture seule », aucun outil d'action, tous readOnlyHint", async () => {
    const rpc = rpcAs("read");
    const init = await (await rpc(1, "initialize", INIT)).json();
    expect(init.result.instructions).toContain("Tous les outils sont en lecture seule");
    expect(init.result.instructions).toContain("nextOffset");
    const list = await (await rpc(2, "tools/list")).json();
    for (const tool of list.result.tools) expect(tool.annotations.readOnlyHint, tool.name).toBe(true);
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).not.toContain("declare_unavailability_confirm");
    // Le brouillon de demande n'est qu'un lien : proposé même en lecture seule.
    expect(names).toContain("draft_request");
  });

  it("connexion avec actions : deux temps et accord explicite exigés ; seule la confirmation modifie", async () => {
    const rpc = rpcAs("read write");
    const init = await (await rpc(1, "initialize", INIT)).json();
    expect(init.result.instructions).toContain("attends l'accord explicite de la personne");
    expect(init.result.instructions).not.toContain("Tous les outils sont en lecture seule");
    expect(init.result.instructions).toContain("déclarer une absence pour soi ; remplir le planning d'un département");
    expect(init.result.instructions).toContain("ni les compétences ni l'effectif");
    const tools = (await (await rpc(2, "tools/list")).json()).result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    const hint = (name: string) => tools.find((t) => t.name === name)?.annotations.readOnlyHint;
    expect(hint("declare_unavailability_preview")).toBe(true);
    expect(hint("declare_unavailability_confirm")).toBe(false);
    expect(hint("planning_candidates")).toBe(true);
  });
});
