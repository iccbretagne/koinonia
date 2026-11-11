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
}));
vi.mock("@/lib/auth", () => ({ buildSessionForUser: vi.fn(async () => null) }));
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
});
