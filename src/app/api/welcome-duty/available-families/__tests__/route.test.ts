import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const { GET } = await import("../route");

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe("GET /api/welcome-duty/available-families", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ user: { id: "user-1" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trie les familles par nom et écarte celles sans id ou sans nom textuel", async () => {
    mockFetch([
      { id: 2, name: "Zacharie" },
      { id: "1", name: "Élie" },
      { id: 3, name: { fr: "objet" } }, // nom non textuel : jamais « [object Object] »
      { id: 0, name: "Sans id" },
      { id: 4 },
    ]);

    const res = await GET(new Request("http://localhost/api/welcome-duty/available-families"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.families).toEqual([
      { id: 1, name: "Élie" },
      { id: 2, name: "Zacharie" },
    ]);
  });

  it("accepte aussi la forme { families: [...] }", async () => {
    mockFetch({ families: [{ id: 5, name: "Abel" }] });

    const res = await GET(new Request("http://localhost/api/welcome-duty/available-families"));

    expect((await res.json()).families).toEqual([{ id: 5, name: "Abel" }]);
  });

  it("répond 502 si le service des familles est indisponible", async () => {
    mockFetch(null, false);

    const res = await GET(new Request("http://localhost/api/welcome-duty/available-families"));

    expect(res.status).toBe(502);
  });
});
